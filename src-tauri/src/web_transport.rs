//! Public-only HTTP transport. Every redirect is resolved, checked and pinned.
use futures_util::StreamExt;
use std::{
    net::{IpAddr, SocketAddr},
    time::Duration,
};
use url::Url;

pub struct WebResponse {
    pub final_url: Url,
    pub content_type: String,
    pub body: Vec<u8>,
}
pub fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => {
            let [a, b, c, _] = v.octets();
            !(a == 0
                || a == 10
                || a == 127
                || a >= 224
                || (a == 100 && (64..=127).contains(&b))
                || (a == 169 && b == 254)
                || (a == 172 && (16..=31).contains(&b))
                || (a == 192 && (b == 168 || b == 0 || (b == 88 && c == 99)))
                || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
                || (a == 203 && b == 0 && c == 113))
        }
        IpAddr::V6(v) => {
            // Only globally routed unicast. Excludes translation/tunnel ranges too.
            let s = v.segments();
            s[0] & 0xe000 == 0x2000
                && !(s[0] == 0x2001 && (s[1] < 0x200 || s[1] == 0xdb8))
                && s[0] != 0x2002
                && !(s[0] == 0x3fff && s[1] < 0x1000)
        }
    }
}
pub fn validate_url(raw: &str) -> Result<Url, String> {
    if raw.len() > 8192 {
        return Err("Web URL is too long".into());
    }
    let mut url = Url::parse(raw).map_err(|_| "Invalid web URL")?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Use a public HTTP(S) URL without credentials".into());
    }
    let host = url
        .host_str()
        .ok_or("Web URL needs a host")?
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.ends_with(".onion")
        || !host.contains('.') && !host.contains(':')
    {
        return Err("Only public web hosts are allowed".into());
    }
    let literal = host.trim_start_matches('[').trim_end_matches(']');
    if let Ok(ip) = literal.parse::<IpAddr>() {
        if !public_ip(ip) {
            return Err("Private or reserved web addresses are not allowed".into());
        }
    }
    url.set_fragment(None);
    Ok(url)
}
fn validate_addresses(addresses: &[SocketAddr]) -> Result<(), String> {
    if addresses.is_empty() || addresses.iter().any(|address| !public_ip(address.ip())) {
        Err("Web host resolves to a private, reserved or unavailable address".into())
    } else {
        Ok(())
    }
}
fn append_bounded(body: &mut Vec<u8>, chunk: &[u8], limit: usize) -> Result<(), String> {
    if body.len().saturating_add(chunk.len()) > limit {
        return Err(format!("Web response exceeds the {limit}-byte limit"));
    }
    body.extend_from_slice(chunk);
    Ok(())
}
pub async fn get(url: &Url, max_bytes: usize) -> Result<WebResponse, String> {
    within_deadline(get_inner(url, max_bytes), Duration::from_secs(30)).await
}
async fn within_deadline<T>(
    future: impl std::future::Future<Output = Result<T, String>>,
    duration: Duration,
) -> Result<T, String> {
    tokio::time::timeout(duration, future)
        .await
        .map_err(|_| format!("Web request timed out after {} seconds", duration.as_secs()))?
}
fn redirect_target(current: &Url, location: &str, hop: usize) -> Result<Url, String> {
    if hop >= 5 {
        return Err("Web page exceeded 5 redirects".into());
    }
    validate_url(
        current
            .join(location)
            .map_err(|_| "Invalid web redirect")?
            .as_str(),
    )
}
async fn get_inner(url: &Url, max_bytes: usize) -> Result<WebResponse, String> {
    let mut current = validate_url(url.as_str())?;
    for hop in 0..=5 {
        let host = current
            .host_str()
            .ok_or("Missing host")?
            .trim_start_matches('[')
            .trim_end_matches(']');
        let port = current.port_or_known_default().ok_or("Missing port")?;
        let addresses: Vec<SocketAddr> = tokio::net::lookup_host((host, port))
            .await
            .map_err(|e| format!("Cannot resolve web host: {e}"))?
            .collect();
        validate_addresses(&addresses)?;
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .resolve_to_addrs(host, &addresses)
            .connect_timeout(Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (compatible; Taro/0.1; public web research)")
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(current.clone())
            .header("Accept-Encoding", "identity")
            .send()
            .await
            .map_err(|e| format!("Cannot fetch web page: {e}"))?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or("Web redirect has no valid destination")?;
            current = redirect_target(&current, location, hop)?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!(
                "Web server returned HTTP {}",
                response.status().as_u16()
            ));
        }
        if response
            .headers()
            .get(reqwest::header::CONTENT_ENCODING)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v != "identity")
        {
            return Err("Web server returned unsupported compressed content".into());
        }
        if response
            .content_length()
            .is_some_and(|size| size > max_bytes as u64)
        {
            return Err("Web response is too large".into());
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let mut body = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            append_bounded(
                &mut body,
                &chunk.map_err(|e| format!("Cannot read web response: {e}"))?,
                max_bytes,
            )?;
        }
        return Ok(WebResponse {
            final_url: current,
            content_type,
            body,
        });
    }
    Err("Web redirect limit reached".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn web_revalidates_redirects_and_caps_hops() {
        let base = Url::parse("https://example.com/a").unwrap();
        assert_eq!(
            redirect_target(&base, "/docs", 4).unwrap().as_str(),
            "https://example.com/docs"
        );
        assert!(redirect_target(&base, "http://127.0.0.1/", 0).is_err());
        assert!(redirect_target(&base, "file:///secret", 0).is_err());
        assert!(redirect_target(&base, "/docs", 5).is_err());
    }
    #[tokio::test]
    async fn web_deadline_drops_stalled_work() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        struct Guard(Arc<AtomicUsize>);
        impl Drop for Guard {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }
        let dropped = Arc::new(AtomicUsize::new(0));
        let guard = Guard(dropped.clone());
        let future = async move {
            let _guard = guard;
            std::future::pending::<Result<(), String>>().await
        };
        assert!(within_deadline(future, Duration::from_millis(10))
            .await
            .unwrap_err()
            .contains("timed out"));
        assert_eq!(dropped.load(Ordering::SeqCst), 1);
    }
    #[test]
    fn web_rejects_private_and_credential_urls() {
        for address in [
            "http://localhost/",
            "http://127.0.0.1/",
            "http://10.0.0.1/",
            "http://169.254.169.254/",
            "http://[::1]/",
            "http://[::ffff:192.168.1.1]/",
            "file:///etc/passwd",
            "https://u:p@example.com/",
        ] {
            assert!(validate_url(address).is_err(), "accepted {address}");
        }
        assert!(validate_url("https://example.com/docs").is_ok());
    }
    #[test]
    fn web_classifies_reserved_addresses_and_mixed_dns() {
        for address in [
            "0.0.0.0",
            "100.64.0.1",
            "192.0.2.1",
            "198.18.0.1",
            "224.0.0.1",
            "::",
            "fc00::1",
            "fe80::1",
            "2001:db8::1",
            "64:ff9b::a00:1",
        ] {
            assert!(!public_ip(address.parse().unwrap()), "accepted {address}");
        }
        assert!(public_ip("1.1.1.1".parse().unwrap()));
        assert!(validate_addresses(&[
            "1.1.1.1:443".parse().unwrap(),
            "127.0.0.1:443".parse().unwrap()
        ])
        .is_err());
        assert!(validate_addresses(&[]).is_err());
    }
    #[test]
    fn web_enforces_stream_limit() {
        let mut body = vec![1, 2];
        assert!(append_bounded(&mut body, &[3, 4], 3).is_err());
        assert!(append_bounded(&mut body, &[3], 3).is_ok());
    }
}
