use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use file_census_backend::web;

mod cli;
mod scan_watch;

#[tokio::main]
async fn main() -> Result<()> {
    let cli = cli::Cli::parse();
    init_tracing(cli.verbose);
    let db_path = cli.db_path()?;

    match cli::run_cli(cli, db_path.clone())? {
        cli::RunOutcome::Done => Ok(()),
        cli::RunOutcome::Serve(args) => serve(db_path, args).await,
    }
}

fn init_tracing(verbose: u8) {
    let default_filter = match verbose {
        0 => "file_census=warn,file_census_backend=warn,tower_http=warn",
        1 => "file_census::cli=info,file_census::rpc=info,file_census::db=info,file_census=info,file_census_backend=info,tower_http=warn",
        2 => "file_census::cli=debug,file_census::rpc=debug,file_census::db=debug,file_census=debug,file_census_backend=debug,tower_http=info",
        _ => "file_census::cli=trace,file_census::rpc=trace,file_census::db=trace,file_census=trace,file_census_backend=trace,tower_http=debug",
    };
    let filter = if verbose > 0 {
        tracing_subscriber::EnvFilter::new(default_filter)
    } else {
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(default_filter))
    };
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .init();
}

async fn serve(db_path: PathBuf, args: cli::ServeArgs) -> Result<()> {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), args.port);
    let url = format!("http://{}", addr);

    if args.open {
        let url_to_open = url.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(350)).await;
            let _ = open::that(url_to_open);
        });
    }

    println!("serving {} with db {}", url, db_path.display());
    web::serve(db_path, addr).await
}
