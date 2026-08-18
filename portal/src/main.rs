use axum::{
    extract::State,
    response::{Html, IntoResponse, Json},
    routing::get,
    Router,
};
use serde::Serialize;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::signal;
use tower_http::cors::{Any, CorsLayer};
use tracing::{info, warn};

#[derive(Clone)]
struct AppConfig {
    opencloud_url: String,
    mail_url: String,
    idp_url: String,
    collabora_url: String,
    portal_domain: String,
    opensme_domain: String,
}

#[derive(Serialize)]
struct Service {
    name: String,
    description: String,
    url: String,
}

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

fn build_landing_page(config: &AppConfig) -> String {
    let services = get_services(config);
    let cards: String = services
        .iter()
        .map(|s| {
            let name = html_escape(&s.name);
            let desc = html_escape(&s.description);
            let url = html_escape(&s.url);
            format!(
                r#"<a href="{url}" class="card" target="_blank" rel="noopener noreferrer">
                <h2>{name}</h2>
                <p>{desc}</p>
            </a>"#
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let domain = html_escape(&config.opensme_domain);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>openSME Portal</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:;">
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
        header {{
            text-align: center;
            padding: 5rem 2rem 2rem;
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
    <header>
        <h1>openSME</h1>
        <p>Your self-hosted productivity suite</p>
    </header>
    <main class="grid">
        {cards}
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

fn build_router(config: Arc<AppConfig>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/", get(handle_root))
        .route("/health", get(handle_health))
        .route("/api/services", get(handle_services))
        .layer(cors)
        .with_state(config)
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

fn load_config() -> AppConfig {
    AppConfig {
        portal_domain: load_env("PORTAL_DOMAIN", "portal.opensme.org"),
        opensme_domain: load_env("OPENSME_DOMAIN", "opensme.org"),
        opencloud_url: load_env("OPENCLOUD_URL", "https://cloud.opensme.org"),
        mail_url: load_env("MAIL_URL", ""),
        idp_url: load_env("IDP_URL", ""),
        collabora_url: load_env("COLLABORA_URL", ""),
    }
}

#[tokio::main]
async fn main() {
    init_logging();

    let config = Arc::new(load_config());

    info!(
        portal_domain = %config.portal_domain,
        opensme_domain = %config.opensme_domain,
        "starting opensme-portal"
    );

    let app = build_router(config);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap_or_else(|e| {
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
