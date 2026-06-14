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
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

#[derive(Clone)]
struct AppConfig {
    opencloud_url: String,
    mail_url: String,
    keycloak_url: String,
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
            format!(
                r#"<a href="{url}" class="card" target="_blank" rel="noopener">
                <h2>{name}</h2>
                <p>{desc}</p>
            </a>"#,
                url = s.url,
                name = s.name,
                desc = s.description
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>openSME Portal</title>
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
            padding: 3rem 1rem 1rem;
        }}
        header h1 {{
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(135deg, #60a5fa, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }}
        header p {{
            color: #94a3b8;
            margin-top: 0.5rem;
            font-size: 1.1rem;
        }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.5rem;
            padding: 2rem;
            max-width: 1200px;
            margin: 0 auto;
            width: 100%;
            flex: 1;
        }}
        .card {{
            background: rgba(30, 41, 59, 0.8);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(148, 163, 184, 0.15);
            border-radius: 1rem;
            padding: 1.5rem;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }}
        .card:hover {{
            border-color: #60a5fa;
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(96, 165, 250, 0.15);
        }}
        .card h2 {{
            font-size: 1.25rem;
            font-weight: 600;
            color: #f1f5f9;
        }}
        .card p {{
            color: #94a3b8;
            font-size: 0.9rem;
            line-height: 1.5;
        }}
        footer {{
            text-align: center;
            padding: 1.5rem;
            color: #475569;
            font-size: 0.85rem;
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
</html>"#,
        cards = cards,
        domain = config.opensme_domain
    )
}

fn get_services(config: &AppConfig) -> Vec<Service> {
    vec![
        Service {
            name: "OpenCloud".into(),
            description: "Cloud storage, file sharing and collaboration".into(),
            url: config.opencloud_url.clone(),
        },
        Service {
            name: "Webmail".into(),
            description: "SOGo groupware — email, calendar and contacts".into(),
            url: config.mail_url.clone(),
        },
        Service {
            name: "Collabora".into(),
            description: "Online document editing".into(),
            url: config.collabora_url.clone(),
        },
        Service {
            name: "Keycloak".into(),
            description: "Single sign-on and identity management".into(),
            url: config.keycloak_url.clone(),
        },
    ]
}

async fn handle_root(State(config): State<Arc<AppConfig>>) -> impl IntoResponse {
    let html = build_landing_page(&config);
    Html(html)
}

async fn handle_health() -> impl IntoResponse {
    Json(serde_json::json!({"status": "ok"}))
}

async fn handle_services(
    State(config): State<Arc<AppConfig>>,
) -> impl IntoResponse {
    let services = get_services(&config);
    Json(serde_json::json!({ "services": services }))
}

fn build_router(config: Arc<AppConfig>) -> Router {
    Router::new()
        .route("/", get(handle_root))
        .route("/health", get(handle_health))
        .route("/api/services", get(handle_services))
        .layer(CorsLayer::permissive())
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
        mail_url: load_env("MAIL_URL", "https://webmail.opensme.org"),
        keycloak_url: load_env("KEYCLOAK_URL", "https://auth.opensme.org"),
        collabora_url: load_env("COLLABORA_URL", "https://collabora.opensme.org"),
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
