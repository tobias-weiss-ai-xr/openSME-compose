use axum::{
    extract::State,
    http::StatusCode,
    middleware,
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::signal;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn};

#[derive(Clone)]
struct AppConfig {
    opencloud_url: String,
    mail_url: String,
    idp_url: String,
    collabora_url: String,
    ticketing_url: String,
    cms_url: String,
    shop_url: String,
    portal_domain: String,
    opensme_domain: String,
    announcements: Arc<Vec<Announcement>>,
    ai: Option<AiConfig>,
    ai_client: reqwest::Client,
}

#[derive(Clone, Debug, PartialEq)]
struct AiConfig {
    api_url: String,
    model: String,
    api_key: Option<String>,
}

/// Portal "intercom": operator-broadcast banners (info / warn).
#[derive(Clone, Debug, PartialEq, Serialize)]
struct Announcement {
    level: String,
    text: String,
}

#[derive(Serialize)]
struct Service {
    name: String,
    description: String,
    url: String,
}

/// Cap the banner count so a runaway env var can't balloon the page.
const MAX_ANNOUNCEMENTS: usize = 8;

/// HTML-escape a string to prevent XSS in rendered templates.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

fn load_env(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| {
        warn!(%key, "environment variable not set, using default");
        default.to_string()
    })
}

/// Parse PORTAL_ANNOUNCEMENTS: a JSON array of {"level": "info"|"warn",
/// "text": "…"}. Unset / empty → no banners. Invalid input is logged and
/// ignored (never break the landing page over a cosmetic feature).
fn parse_announcements(raw: &str) -> Vec<Announcement> {
    if raw.trim().is_empty() {
        return Vec::new();
    }
    #[derive(Deserialize)]
    struct RawAnnouncement {
        level: Option<String>,
        text: String,
    }
    match serde_json::from_str::<Vec<RawAnnouncement>>(raw) {
        Ok(items) => items
            .into_iter()
            .filter(|a| !a.text.trim().is_empty())
            .map(|a| Announcement {
                level: if a.level.as_deref() == Some("warn") {
                    "warn".to_string()
                } else {
                    "info".to_string()
                },
                text: a.text,
            })
            .take(MAX_ANNOUNCEMENTS)
            .collect(),
        Err(e) => {
            warn!(%e, "invalid PORTAL_ANNOUNCEMENTS json — ignoring");
            Vec::new()
        }
    }
}

fn render_announcements(announcements: &[Announcement]) -> String {
    announcements
        .iter()
        .map(|a| {
            let cls = if a.level == "warn" {
                "announcement warn"
            } else {
                "announcement info"
            };
            let text = html_escape(&a.text);
            format!(r#"<div class="{cls}" role="status"><span class="pill">⚑</span> {text}</div>"#)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn build_landing_page(config: &AppConfig) -> String {
    let services = get_services(config);
    let cards: String = services
        .iter()
        .map(|s| {
            let name = html_escape(&s.name);
            let desc = html_escape(&s.description);
            let url = html_escape(&s.url);
            format!(
                r#"<a href="{url}" class="card" data-pal="{name}" target="_blank" rel="noopener noreferrer">
                <h2>{name}</h2>
                <p>{desc}</p>
            </a>"#
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let ai_card = if config.ai.is_some() {
        r#"<div class="card ai" id="ai-card">
                <h2>AI Assistant</h2>
                <div class="ai-box">
                    <input class="ai-q" type="text" placeholder="Ask a question…" aria-label="Question">
                    <button class="ai-ask" type="button">Ask</button>
                    <p class="ai-out" hidden></p>
                </div>
            </div>"#
    } else {
        ""
    };

    let announcements = render_announcements(&config.announcements);
    let domain = html_escape(&config.opensme_domain);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>openSME Portal</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self';">
    <script src="/app.js" defer></script>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }}
        .announcement {{
            text-align: center;
            padding: 0.6rem 1rem;
            font-size: 0.92rem;
        }}
        .announcement .pill {{ opacity: 0.8; }}
        .announcement.info {{ background: rgba(37, 99, 235, 0.22); color: #bfdbfe; }}
        .announcement.warn {{ background: rgba(217, 119, 6, 0.25); color: #fde68a; }}
        header {{
            text-align: center;
            padding: 3.5rem 2rem 1.5rem;
        }}
        header h1 {{
            font-size: 3rem;
            font-weight: 700;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, #60a5fa, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 0.75rem;
        }}
        header p {{
            color: #94a3b8;
            font-size: 1.15rem;
            line-height: 1.6;
            max-width: 480px;
            margin: 0 auto;
        }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.75rem;
            padding: 3rem 2rem;
            max-width: 960px;
            margin: 0 auto;
            width: 100%;
            flex: 1;
        }}
        .card {{
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(148, 163, 184, 0.12);
            border-radius: 1.25rem;
            padding: 2rem;
            text-decoration: none;
            color: inherit;
            transition: all 0.25s ease;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }}
        .card:hover {{
            border-color: rgba(96, 165, 250, 0.5);
            transform: translateY(-3px);
            box-shadow: 0 12px 32px rgba(96, 165, 250, 0.12);
            background: rgba(30, 41, 59, 0.95);
        }}
        .card h2 {{
            font-size: 1.3rem;
            font-weight: 600;
            color: #f1f5f9;
            letter-spacing: -0.01em;
        }}
        .card p {{
            color: #94a3b8;
            font-size: 0.95rem;
            line-height: 1.65;
        }}
        .card.ai {{
            border-style: dashed;
        }}
        .ai-box {{ display: flex; flex-direction: column; gap: 0.6rem; }}
        .ai-q {{
            background: rgba(15, 23, 42, 0.7);
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 0.6rem;
            color: #e2e8f0;
            padding: 0.55rem 0.75rem;
            font-size: 0.95rem;
        }}
        .ai-ask {{
            align-self: flex-start;
            background: rgba(96, 165, 250, 0.18);
            border: 1px solid rgba(96, 165, 250, 0.45);
            border-radius: 0.6rem;
            color: #bfdbfe;
            padding: 0.45rem 1rem;
            font-size: 0.92rem;
            cursor: pointer;
        }}
        .ai-ask:hover {{ background: rgba(96, 165, 250, 0.32); }}
        .ai-out {{
            color: #cbd5e1;
            font-size: 0.92rem;
            line-height: 1.55;
            white-space: pre-wrap;
        }}
        #palette {{
            position: fixed;
            inset: 0;
            background: rgba(2, 6, 23, 0.72);
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding-top: 14vh;
            z-index: 40;
        }}
        #palette[hidden] {{ display: none; }}
        .pal-box {{
            width: min(520px, 92vw);
            background: #1e293b;
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 1rem;
            overflow: hidden;
            box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
        }}
        #pal-input {{
            width: 100%;
            background: transparent;
            border: none;
            border-bottom: 1px solid rgba(148, 163, 184, 0.2);
            color: #e2e8f0;
            font-size: 1.05rem;
            padding: 0.9rem 1.1rem;
            outline: none;
        }}
        #pal-list {{ list-style: none; max-height: 46vh; overflow-y: auto; }}
        #pal-list li {{
            padding: 0.6rem 1.1rem;
            color: #cbd5e1;
            cursor: pointer;
            font-size: 0.98rem;
        }}
        #pal-list li.sel {{ background: rgba(96, 165, 250, 0.16); color: #f1f5f9; }}
        #pal-list li.none {{ color: #64748b; cursor: default; }}
        .pal-hint {{
            padding: 0.5rem 1.1rem 0.7rem;
            color: #475569;
            font-size: 0.78rem;
            border-top: 1px solid rgba(148, 163, 184, 0.12);
        }}
        #pal-hint {{
            position: fixed;
            right: 1.1rem;
            bottom: 1.1rem;
            background: rgba(30, 41, 59, 0.85);
            border: 1px solid rgba(148, 163, 184, 0.25);
            border-radius: 0.55rem;
            color: #94a3b8;
            font-size: 0.8rem;
            padding: 0.35rem 0.6rem;
            cursor: pointer;
            z-index: 30;
        }}
        #pal-hint:hover {{ color: #e2e8f0; border-color: rgba(96, 165, 250, 0.5); }}
        footer {{
            text-align: center;
            padding: 2.5rem 2rem;
            color: #475569;
            font-size: 0.85rem;
            letter-spacing: 0.01em;
        }}
    </style>
</head>
<body>
    {announcements}
    <header>
        <h1>openSME</h1>
        <p>Your self-hosted productivity suite</p>
    </header>
    <main class="grid">
        {cards}
        {ai_card}
    </main>
    <footer>
        openSME Portal &mdash; {domain}
    </footer>
</body>
</html>"#
    )
}

/// Return only services that have a non-default URL (i.e. actually configured).
fn get_services(config: &AppConfig) -> Vec<Service> {
    let mut services = Vec::new();

    if !config.idp_url.is_empty() {
        services.push(Service {
            name: "Identity".into(),
            description: "Single sign-on and user management".into(),
            url: config.idp_url.clone(),
        });
    }

    // OpenCloud — only if URL differs from the raw default
    if !config.opencloud_url.is_empty() {
        services.push(Service {
            name: "OpenCloud".into(),
            description: "Cloud storage, file sharing and collaboration".into(),
            url: config.opencloud_url.clone(),
        });
    }

    // Collabora — only if explicitly configured (not empty)
    if !config.collabora_url.is_empty() {
        services.push(Service {
            name: "Collabora".into(),
            description: "Online document editing".into(),
            url: config.collabora_url.clone(),
        });
    }

    // Webmail — only if explicitly configured (not empty)
    if !config.mail_url.is_empty() {
        services.push(Service {
            name: "Webmail".into(),
            description: "Email, calendar and contacts".into(),
            url: config.mail_url.clone(),
        });
    }

    // Helpdesk — only if explicitly configured (not empty)
    if !config.ticketing_url.is_empty() {
        services.push(Service {
            name: "Support".into(),
            description: "Helpdesk — tickets and knowledge base".into(),
            url: config.ticketing_url.clone(),
        });
    }

    // Website CMS — only if explicitly configured (not empty)
    if !config.cms_url.is_empty() {
        services.push(Service {
            name: "Website".into(),
            description: "Content management — pages, news and blog".into(),
            url: config.cms_url.clone(),
        });
    }

    // Store — only if explicitly configured (not empty)
    if !config.shop_url.is_empty() {
        services.push(Service {
            name: "Shop".into(),
            description: "Storefront — products, cart and checkout".into(),
            url: config.shop_url.clone(),
        });
    }

    services
}

async fn handle_root(State(config): State<Arc<AppConfig>>) -> impl IntoResponse {
    let html = build_landing_page(&config);
    Html(html)
}

async fn handle_health() -> impl IntoResponse {
    Json(serde_json::json!({"status": "ok"}))
}

async fn handle_services(State(config): State<Arc<AppConfig>>) -> impl IntoResponse {
    let services = get_services(&config);
    Json(serde_json::json!({ "services": services }))
}

async fn handle_announcements(State(config): State<Arc<AppConfig>>) -> impl IntoResponse {
    Json(serde_json::json!({ "announcements": config.announcements.as_ref() }))
}

#[derive(Deserialize)]
struct AiChatRequest {
    question: String,
}

#[derive(Deserialize)]
struct ChatChoiceMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: Option<ChatChoiceMessage>,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

/// Same-origin proxy to the operator-configured OpenAI-compatible endpoint.
/// Only mounted when AI_API_URL is set (card and endpoint stay hidden
/// otherwise). Stateless by design: one question in, one answer out.
async fn handle_ai_chat(
    State(config): State<Arc<AppConfig>>,
    Json(req): Json<AiChatRequest>,
) -> impl IntoResponse {
    let Some(ai) = config.ai.as_ref() else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "error": "AI integration not configured"
            })),
        );
    };

    let question = req.question.trim().to_string();
    if question.is_empty() || question.len() > 4000 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "question must be 1-4000 chars" })),
        );
    }

    let url = format!("{}/v1/chat/completions", ai.api_url.trim_end_matches('/'));
    let mut builder = config.ai_client.post(&url).json(&serde_json::json!({
        "model": ai.model,
        "messages": [{ "role": "user", "content": question }],
        "max_tokens": 512,
    }));
    if let Some(key) = ai.api_key.as_deref().filter(|k| !k.is_empty()) {
        builder = builder.bearer_auth(key);
    }

    match builder.send().await {
        Ok(resp) if resp.status().is_success() => match resp.json::<ChatResponse>().await {
            Ok(body) => {
                let answer = body
                    .choices
                    .first()
                    .and_then(|c| c.message.as_ref())
                    .and_then(|m| m.content.clone())
                    .unwrap_or_default();
                (
                    StatusCode::OK,
                    Json(serde_json::json!({ "answer": answer })),
                )
            }
            Err(e) => (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": format!("upstream decode error: {e}") })),
            ),
        },
        Ok(resp) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "error": format!("upstream returned {}", resp.status())
            })),
        ),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": format!("upstream unreachable: {e}") })),
        ),
    }
}

/// Security headers on every response (belt-and-braces with the CSP meta
/// tag in the HTML — headers also cover the JSON API responses).
async fn security_headers(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let mut res = next.run(request).await;
    let h = res.headers_mut();
    h.insert("x-content-type-options", "nosniff".parse().unwrap());
    h.insert("x-frame-options", "DENY".parse().unwrap());
    h.insert(
        "referrer-policy",
        "strict-origin-when-cross-origin".parse().unwrap(),
    );
    h.insert(
        "content-security-policy",
        "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'"
            .parse()
            .unwrap(),
    );
    res
}

fn build_router(config: Arc<AppConfig>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let mut router = Router::new()
        .route("/", get(handle_root))
        .route("/app.js", get(handle_app_js))
        .route("/health", get(handle_health))
        .route("/api/services", get(handle_services))
        .route("/api/announcements", get(handle_announcements));

    if config.ai.is_some() {
        router = router.route("/api/ai/chat", post(handle_ai_chat));
    }

    router
        .layer(middleware::from_fn(security_headers))
        .layer(cors)
        .with_state(config)
}

async fn handle_app_js() -> impl IntoResponse {
    (
        [(
            axum::http::header::CONTENT_TYPE,
            "application/javascript; charset=utf-8",
        )],
        include_str!("app.js"),
    )
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    info!("shutdown signal received, starting graceful shutdown");
}

fn init_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "opensme_portal=info,tower_http=info".into()),
        )
        .init();
}

fn load_config() -> Arc<AppConfig> {
    let ai_api_url = load_env("AI_API_URL", "");
    let ai = if ai_api_url.is_empty() {
        None
    } else {
        Some(AiConfig {
            api_url: ai_api_url,
            model: load_env("AI_MODEL", ""),
            api_key: std::env::var("AI_API_KEY").ok(),
        })
    };

    let announcements = Arc::new(parse_announcements(&load_env("PORTAL_ANNOUNCEMENTS", "")));

    Arc::new(AppConfig {
        portal_domain: load_env("PORTAL_DOMAIN", "portal.opensme.org"),
        opensme_domain: load_env("OPENSME_DOMAIN", "opensme.org"),
        opencloud_url: load_env("OPENCLOUD_URL", "https://cloud.opensme.org"),
        mail_url: load_env("MAIL_URL", ""),
        idp_url: load_env("IDP_URL", ""),
        collabora_url: load_env("COLLABORA_URL", ""),
        ticketing_url: load_env("TICKETING_URL", ""),
        cms_url: load_env("CMS_URL", ""),
        shop_url: load_env("SHOP_URL", ""),
        announcements,
        ai,
        // One shared client: connection pooling, 30s default timeout.
        ai_client: reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .unwrap_or_default(),
    })
}

#[tokio::main]
async fn main() {
    init_logging();

    let config = load_config();

    info!(
        portal_domain = %config.portal_domain,
        opensme_domain = %config.opensme_domain,
        ai_enabled = config.ai.is_some(),
        announcements = config.announcements.len(),
        "starting opensme-portal"
    );

    let app = build_router(config);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| {
            panic!("failed to bind to {addr}: {e}");
        });

    info!("listening on {addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap_or_else(|e| {
            panic!("server error: {e}");
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg_with(ticketing: &str, ai: Option<AiConfig>, announcements: &str) -> AppConfig {
        AppConfig {
            opencloud_url: "https://cloud.example".into(),
            mail_url: String::new(),
            idp_url: "https://auth.example".into(),
            collabora_url: String::new(),
            ticketing_url: ticketing.into(),
            cms_url: String::new(),
            shop_url: String::new(),
            portal_domain: "portal.example".into(),
            opensme_domain: "example".into(),
            announcements: Arc::new(parse_announcements(announcements)),
            ai,
            ai_client: reqwest::Client::new(),
        }
    }

    #[test]
    fn announcements_empty_for_unset_or_blank() {
        assert!(parse_announcements("").is_empty());
        assert!(parse_announcements("   ").is_empty());
    }

    #[test]
    fn announcements_parse_valid() {
        let raw = r#"[{"level":"warn","text":"Maintenance tonight"},{"text":"Welcome"}]"#;
        let got = parse_announcements(raw);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].level, "warn");
        assert_eq!(got[1].level, "info"); // default level
    }

    #[test]
    fn announcements_invalid_json_ignored() {
        assert!(parse_announcements("not json").is_empty());
        assert!(parse_announcements(r#"{"level":"info"}"#).is_empty()); // not an array
    }

    #[test]
    fn announcements_capped_and_blank_filtered() {
        let mut raw = String::from("[");
        for i in 0..20 {
            if i > 0 {
                raw.push_str(", ");
            }
            raw.push_str(&format!("{{\"text\":\"m{i}\"}}"));
        }
        raw.push_str(", {\"text\":\"   \"}]"); // 20 valid + 1 blank
        assert_eq!(parse_announcements(&raw).len(), MAX_ANNOUNCEMENTS);
    }

    #[test]
    fn announcements_rendered_escaped() {
        let a = Announcement {
            level: "info".into(),
            text: "<script>alert(1)</script> & \"quotes\"".into(),
        };
        let html = render_announcements(&[a]);
        assert!(html.contains("&lt;script&gt;"));
        assert!(!html.contains("<script>"));
        assert!(html.contains("&amp;"));
        assert!(html.contains("&quot;"));
    }

    #[test]
    fn ticketing_card_gated_on_url() {
        let with = get_services(&cfg_with("https://help.example", None, ""));
        assert!(with.iter().any(|s| s.name == "Support"));

        let without = get_services(&cfg_with("", None, ""));
        assert!(!without.iter().any(|s| s.name == "Support"));
    }

    #[test]
    fn cms_and_shop_cards_gated_on_url() {
        let mut c = cfg_with("", None, "");
        assert!(!get_services(&c).iter().any(|s| s.name == "Website"));
        assert!(!get_services(&c).iter().any(|s| s.name == "Shop"));

        c.cms_url = "https://www.example".into();
        c.shop_url = "https://shop.example".into();
        let services = get_services(&c);
        assert!(services.iter().any(|s| s.name == "Website"));
        assert!(services.iter().any(|s| s.name == "Shop"));
    }

    #[test]
    fn ai_card_and_page_wiring() {
        let ai = AiConfig {
            api_url: "http://vllm:8000".into(),
            model: "test-model".into(),
            api_key: None,
        };
        let html = build_landing_page(&cfg_with("", Some(ai.clone()), ""));
        assert!(html.contains("id=\"ai-card\""));

        let plain = build_landing_page(&cfg_with("", None, ""));
        assert!(!plain.contains("id=\"ai-card\""));
    }

    #[test]
    fn announcements_rendered_into_page() {
        let html = build_landing_page(&cfg_with(
            "",
            None,
            r#"[{"level":"warn","text":"planned outage"}]"#,
        ));
        assert!(html.contains("class=\"announcement warn\""));
        assert!(html.contains("planned outage"));
    }

    #[test]
    fn fast_switch_marker_on_cards() {
        let html = build_landing_page(&cfg_with("", None, ""));
        assert!(html.contains("data-pal="));
        assert!(html.contains("/app.js"));
    }

    #[test]
    fn html_escape_covers_angle_brackets() {
        assert_eq!(html_escape("<b>"), "&lt;b&gt;");
    }
}
