ARG RUST_VERSION=1.88
FROM rust:${RUST_VERSION}-slim-bookworm AS chef
RUN cargo install cargo-chef --locked
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN cargo build --release --bin opensme-portal

FROM gcr.io/distroless/cc-debian12 AS runtime
COPY --from=builder /app/target/release/opensme-portal /opensme-portal
USER 1000:1000
EXPOSE 8080
CMD ["/opensme-portal"]
