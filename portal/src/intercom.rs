//! Portal intercom — internal short messages with cloud attachments.
//!
//! Epics T/U (docs/E2E-JOURNEYS.md): users post short notes; a note may
//! reference one attachment FROM the cloud service by URL. The portal
//! snapshots the attachment's METADATA at send time (HEAD request) and
//! never proxies file bodies.
//!
//! Store is in-memory by design (v1): conversational ephemera, capped
//! FIFO, lost on restart. This module owns validation, URL policy and
//! metadata parsing; HTTP wiring lives in main.rs.

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

pub const MAX_TEXT: usize = 2000;
pub const MAX_URL: usize = 2048;
pub const MAX_MESSAGES: usize = 50;

/// Attachment reference snapshot taken when the message was sent.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Attachment {
    pub url: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    pub content_type: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct IntercomMessage {
    pub id: u64,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment: Option<Attachment>,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct IntercomConfig {
    /// Hosts (or host:port) the portal accepts attachment URLs from.
    pub allowed_hosts: Vec<String>,
    /// Dev escape hatch: accept http:// attachment URLs (never in prod).
    pub allow_http: bool,
}

impl IntercomConfig {
    pub fn from_env(opensme_domain: &str) -> Self {
        let default_hosts = format!("cloud.{}", opensme_domain);
        let raw =
            std::env::var("INTERCOM_ATTACHMENT_HOSTS").unwrap_or_else(|_| default_hosts.clone());
        let allowed_hosts = raw
            .split(',')
            .map(|h| h.trim().to_lowercase())
            .filter(|h| !h.is_empty())
            .collect::<Vec<_>>();
        let allowed_hosts = if allowed_hosts.is_empty() {
            vec![default_hosts.to_lowercase()]
        } else {
            allowed_hosts
        };
        Self {
            allowed_hosts,
            allow_http: std::env::var("INTERCOM_ALLOW_HTTP")
                .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
        }
    }
}

pub struct IntercomStore {
    messages: Mutex<VecDeque<IntercomMessage>>,
    next_id: AtomicU64,
}

impl Default for IntercomStore {
    fn default() -> Self {
        Self {
            messages: Mutex::new(VecDeque::new()),
            next_id: AtomicU64::new(1),
        }
    }
}

// ── Validation ────────────────────────────────────────────────────────────

pub fn validate_text(raw: &str) -> Result<String, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Err("message text is empty".into());
    }
    if text.len() > MAX_TEXT {
        return Err(format!("message text exceeds {} bytes", MAX_TEXT));
    }
    Ok(text.to_string())
}

pub fn validate_attachment_url(raw: &str, cfg: &IntercomConfig) -> Result<String, String> {
    if raw.len() > MAX_URL {
        return Err(format!("attachment url exceeds {} bytes", MAX_URL));
    }
    let url =
        reqwest::Url::parse(raw).map_err(|_| "attachment url is not a valid URL".to_string())?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err("attachment url must not carry credentials".into());
    }
    let scheme = url.scheme();
    if scheme != "https" && !(scheme == "http" && cfg.allow_http) {
        return Err("attachment url must use https".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "attachment url has no host".to_string())?;
    // IP literals are never accepted — the cloud is addressed by name.
    if host.parse::<std::net::IpAddr>().is_ok() || host.starts_with('[') {
        return Err("attachment url must address the cloud by name, not IP".into());
    }
    let host_lower = host.to_lowercase();
    let host_with_port = match url.port() {
        Some(p) => format!("{}:{}", host_lower, p),
        None => host_lower.clone(),
    };
    let allowed = cfg
        .allowed_hosts
        .iter()
        .any(|h| *h == host_with_port || (*h == host_lower && url.port().is_none()));
    if !allowed {
        return Err(format!("attachment host not allowed: {}", host));
    }
    Ok(url.to_string())
}

pub fn parse_attachment_metadata(
    url: &str,
    content_type: Option<&str>,
    content_length: Option<u64>,
    content_disposition: Option<&str>,
) -> Attachment {
    let name = content_disposition
        .and_then(|cd| {
            cd.split(';')
                .map(|p| p.trim())
                .find_map(|p| {
                    p.strip_prefix("filename=")
                        .or_else(|| p.strip_prefix("filename*="))
                })
                .map(|f| {
                    f.trim()
                        .trim_matches('"')
                        .rsplit("''") // RFC 5987 filename*=UTF-8''name
                        .next()
                        .unwrap_or(f)
                        .to_string()
                })
        })
        .filter(|f| !f.is_empty())
        .unwrap_or_else(|| {
            reqwest::Url::parse(url)
                .ok()
                .and_then(|u| {
                    u.path_segments()
                        .and_then(|mut segs| segs.next_back())
                        .map(|s| s.to_string())
                })
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "attachment".into())
        });
    Attachment {
        url: url.to_string(),
        name,
        size: content_length,
        content_type: content_type
            .unwrap_or("application/octet-stream")
            .split(';')
            .next()
            .unwrap_or("application/octet-stream")
            .trim()
            .to_string(),
    }
}

// ── Store ────────────────────────────────────────────────────────────────

impl IntercomStore {
    pub fn push(&self, text: String, attachment: Option<Attachment>) -> IntercomMessage {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        // Unix seconds — enough for ordering; no extra time crate needed.
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();
        let msg = IntercomMessage {
            id,
            text,
            attachment,
            created_at,
        };
        let mut messages = self.messages.lock().unwrap_or_else(|e| e.into_inner());
        messages.push_back(msg);
        while messages.len() > MAX_MESSAGES {
            messages.pop_front();
        }
        messages.back().expect("just pushed").clone()
    }

    pub fn list(&self) -> Vec<IntercomMessage> {
        self.messages
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .rev()
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> IntercomConfig {
        IntercomConfig {
            allowed_hosts: vec!["cloud.example".into()],
            allow_http: false,
        }
    }

    // ── text ──────────────────────────────────────────────────────────

    #[test]
    fn text_is_trimmed_and_kept() {
        assert_eq!(validate_text("  Hallo Team  ").unwrap(), "Hallo Team");
    }

    #[test]
    fn text_blank_rejected() {
        assert!(validate_text("").is_err());
        assert!(validate_text("   \n\t ").is_err());
    }

    #[test]
    fn text_over_limit_rejected() {
        let long = "x".repeat(MAX_TEXT + 1);
        assert!(validate_text(&long).is_err());
        assert!(validate_text(&"x".repeat(MAX_TEXT)).is_ok());
    }

    // ── attachment URLs ───────────────────────────────────────────────

    #[test]
    fn attachment_url_https_allowlisted_ok() {
        let url = validate_attachment_url("https://cloud.example/s/abc123", &cfg()).unwrap();
        assert_eq!(url, "https://cloud.example/s/abc123");
    }

    #[test]
    fn attachment_url_foreign_host_rejected() {
        assert!(validate_attachment_url("https://evil.example/s/abc", &cfg()).is_err());
    }

    #[test]
    fn attachment_url_http_rejected_unless_allowed() {
        assert!(validate_attachment_url("http://cloud.example/s/abc", &cfg()).is_err());
        let dev = IntercomConfig {
            allowed_hosts: vec!["cloud.example".into()],
            allow_http: true,
        };
        assert!(validate_attachment_url("http://cloud.example/s/abc", &dev).is_ok());
    }

    #[test]
    fn attachment_url_allowlist_host_port_matching() {
        let dev = IntercomConfig {
            allowed_hosts: vec!["gateway.local:8099".into()],
            allow_http: true,
        };
        assert!(validate_attachment_url("http://gateway.local:8099/files/x.pdf", &dev).is_ok());
        // same host, wrong port → not on the allowlist
        assert!(validate_attachment_url("http://gateway.local:1234/files/x.pdf", &dev).is_err());
    }

    #[test]
    fn attachment_url_ip_literals_always_rejected() {
        let listed = IntercomConfig {
            allowed_hosts: vec!["127.0.0.1".into()],
            allow_http: true,
        };
        assert!(validate_attachment_url("https://127.0.0.1/s/abc", &listed).is_err());
        let v6 = "https://[::1]/s/abc";
        assert!(validate_attachment_url(v6, &cfg()).is_err());
    }

    #[test]
    fn attachment_url_userinfo_rejected() {
        assert!(validate_attachment_url("https://evil@cloud.example/s/abc", &cfg()).is_err());
    }

    #[test]
    fn attachment_url_size_capped() {
        let long = format!("https://cloud.example/s/{}", "a".repeat(MAX_URL));
        assert!(validate_attachment_url(&long, &cfg()).is_err());
    }

    // ── metadata snapshot ─────────────────────────────────────────────

    #[test]
    fn metadata_from_disposition_headers() {
        let a = parse_attachment_metadata(
            "https://cloud.example/s/abc",
            Some("application/pdf"),
            Some(12345),
            Some("attachment; filename=\"Rechnung 2026.pdf\""),
        );
        assert_eq!(a.name, "Rechnung 2026.pdf");
        assert_eq!(a.size, Some(12345));
        assert_eq!(a.content_type, "application/pdf");
    }

    #[test]
    fn metadata_falls_back_to_last_path_segment() {
        let a = parse_attachment_metadata(
            "https://cloud.example/s/files/Bericht.docx",
            None,
            None,
            None,
        );
        assert_eq!(a.name, "Bericht.docx");
        assert_eq!(a.size, None);
        assert_eq!(a.content_type, "application/octet-stream");
    }

    // ── store ─────────────────────────────────────────────────────────

    #[test]
    fn store_caps_fifo_and_lists_newest_first() {
        let store = IntercomStore::default();
        for i in 0..(MAX_MESSAGES + 10) {
            store.push(format!("m{i}"), None);
        }
        let listed = store.list();
        assert_eq!(listed.len(), MAX_MESSAGES);
        assert_eq!(listed[0].text, format!("m{}", MAX_MESSAGES + 9));
        assert!(!listed.iter().any(|m| m.text == "m0"));
    }

    #[test]
    fn store_message_carries_attachment_snapshot() {
        let store = IntercomStore::default();
        let att = parse_attachment_metadata(
            "https://cloud.example/s/abc",
            Some("application/pdf"),
            Some(7),
            Some("attachment; filename=\"a.pdf\""),
        );
        let m = store.push("see attached".into(), Some(att.clone()));
        assert_eq!(store.list()[0].attachment.as_ref().unwrap().name, "a.pdf");
        assert_eq!(m.id, 1);
    }
}
