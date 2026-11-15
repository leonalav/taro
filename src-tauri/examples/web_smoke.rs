//! Manual smoke check: cargo run --example web_smoke -- search "query" OR fetch URL.
#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (name, input) = if args.get(1).is_some_and(|a| a == "search") {
        (
            "WebSearch",
            serde_json::json!({"query":args.get(2).map(String::as_str).unwrap_or("Rust programming language"),"max_results":3}),
        )
    } else {
        (
            "WebFetch",
            serde_json::json!({"url":args.get(2).map(String::as_str).unwrap_or("https://example.com"),"limit":1000}),
        )
    };
    match taro::web_tools::execute(name, &input).await {
        Ok(value) => println!("{}", value["text"].as_str().unwrap_or_default()),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
