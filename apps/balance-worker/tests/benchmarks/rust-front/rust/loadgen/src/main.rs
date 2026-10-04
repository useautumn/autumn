//! Closed-loop HTTP load for one hot customer: `conns` keep-alive connections, one track in flight each.
//! Reports tracks/s and, for each `--pids` process, CPU µs per track split by thread (schedstat, ns).
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use http_body_util::{BodyExt, Full};
use hyper::Request;
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

struct Template {
    parts: Vec<String>,
}

impl Template {
    fn load(path: &str) -> Self {
        let text = std::fs::read_to_string(path).expect("template");
        Template { parts: text.trim_end().split("__ID__").map(String::from).collect() }
    }
    fn body(&self, id: &str) -> Bytes {
        let mut out = String::with_capacity(self.parts.iter().map(String::len).sum::<usize>() + 64);
        for (i, part) in self.parts.iter().enumerate() {
            if i > 0 {
                out.push_str(id);
            }
            out.push_str(part);
        }
        Bytes::from(out)
    }
}

/// ns on CPU per thread of a process, keyed by "tid:comm".
fn thread_cpu(pid: u32) -> HashMap<String, u64> {
    let mut out = HashMap::new();
    let Ok(tasks) = std::fs::read_dir(format!("/proc/{pid}/task")) else { return out };
    for task in tasks.flatten() {
        let tid = task.file_name().to_string_lossy().into_owned();
        let base = format!("/proc/{pid}/task/{tid}");
        let ns = std::fs::read_to_string(format!("{base}/schedstat"))
            .ok()
            .and_then(|s| s.split_whitespace().next().and_then(|v| v.parse::<u64>().ok()))
            .unwrap_or(0);
        let comm = std::fs::read_to_string(format!("{base}/comm")).unwrap_or_default().trim().to_string();
        out.insert(format!("{tid}:{comm}"), ns);
    }
    out
}

/// (user, sys) seconds of a whole process from /proc/<pid>/stat.
fn user_sys(pid: u32) -> (f64, f64) {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).unwrap_or_default();
    let Some(close) = stat.rfind(')') else { return (0.0, 0.0) };
    let fields: Vec<&str> = stat[close + 2..].split(' ').collect();
    let tick = 100.0;
    let user = fields.get(11).and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0) / tick;
    let sys = fields.get(12).and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0) / tick;
    (user, sys)
}

async fn connect(addr: &str) -> hyper::client::conn::http1::SendRequest<Full<Bytes>> {
    let stream = match TcpStream::connect(addr).await {
        Ok(stream) => stream,
        Err(error) => {
            eprintln!("connect {addr}: {error}");
            std::process::exit(1);
        }
    };
    stream.set_nodelay(true).ok();
    let (sender, conn) = hyper::client::conn::http1::handshake(TokioIo::new(stream)).await.expect("handshake");
    tokio::spawn(async move {
        let _ = conn.await;
    });
    sender
}

fn request(host: &str, path: &str, body: Bytes) -> Request<Full<Bytes>> {
    Request::post(path)
        .header("host", host)
        .header("content-type", "application/json")
        .header("x-request-budget-ms", "5000")
        .body(Full::new(body))
        .unwrap()
}

async fn sequential(args: &[String]) {
    let addr = arg(args, "--addr").unwrap_or_else(|| "127.0.0.1:8092".into());
    let path = arg(args, "--path").unwrap_or_else(|| "/v1/track".into());
    let count: usize = arg(args, "--count").and_then(|v| v.parse().ok()).unwrap_or(200);
    let template = Template::load(&arg(args, "--template").expect("--template"));
    let out_path = arg(args, "--out").expect("--out");
    let prefix = arg(args, "--prefix").unwrap_or_else(|| "seq".into());
    let mut sender = connect(&addr).await;
    let mut out = Vec::new();
    for i in 0..count {
        sender.ready().await.expect("ready");
        let response = sender.send_request(request(&addr, &path, template.body(&format!("{prefix}_{i}")))).await.expect("send");
        let status = response.status().as_u16();
        let body = response.into_body().collect().await.expect("body").to_bytes();
        out.extend_from_slice(&(status as u32).to_le_bytes());
        out.extend_from_slice(&(body.len() as u32).to_le_bytes());
        out.extend_from_slice(&body);
    }
    std::fs::write(&out_path, out).expect("write");
    eprintln!("wrote {count} replies to {out_path}");
}

async fn load(args: &[String]) {
    let addr = arg(args, "--addr").unwrap_or_else(|| "127.0.0.1:8092".into());
    let path = arg(args, "--path").unwrap_or_else(|| "/v1/track".into());
    let conns: usize = arg(args, "--conns").and_then(|v| v.parse().ok()).unwrap_or(200);
    let warmup: f64 = arg(args, "--warmup").and_then(|v| v.parse().ok()).unwrap_or(3.0);
    let secs: f64 = arg(args, "--secs").and_then(|v| v.parse().ok()).unwrap_or(10.0);
    let label = arg(args, "--label").unwrap_or_default();
    let prefix = arg(args, "--prefix").unwrap_or_else(|| {
        format!("ld{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis())
    });
    let pids: Vec<(String, u32)> = arg(args, "--pids")
        .map(|v| {
            v.split(',')
                .filter(|s| !s.is_empty())
                .map(|s| {
                    let (name, pid) = s.split_once('=').unwrap_or(("proc", s));
                    (name.to_string(), pid.parse().expect("pid"))
                })
                .collect()
        })
        .unwrap_or_default();
    let template = Arc::new(Template::load(&arg(args, "--template").expect("--template")));

    let counter = Arc::new(AtomicU64::new(0));
    let completed = Arc::new(AtomicU64::new(0));
    let errors = Arc::new(AtomicU64::new(0));
    let measuring = Arc::new(AtomicBool::new(false));
    let stop = Arc::new(AtomicBool::new(false));
    let latencies = Arc::new(std::sync::Mutex::new(Vec::<u32>::with_capacity(1 << 20)));
    let mut handles = Vec::new();
    for _ in 0..conns {
        let (addr, path, template, prefix) = (addr.clone(), path.clone(), template.clone(), prefix.clone());
        let (counter, completed, errors, measuring, stop, latencies) =
            (counter.clone(), completed.clone(), errors.clone(), measuring.clone(), stop.clone(), latencies.clone());
        handles.push(tokio::spawn(async move {
            let mut sender = connect(&addr).await;
            let mut local = Vec::with_capacity(1 << 14);
            while !stop.load(Ordering::Relaxed) {
                let n = counter.fetch_add(1, Ordering::Relaxed);
                let started = Instant::now();
                let response = match sender.send_request(request(&addr, &path, template.body(&format!("{prefix}_{n}")))).await {
                    Ok(r) => r,
                    Err(_) => {
                        errors.fetch_add(1, Ordering::Relaxed);
                        sender = connect(&addr).await;
                        continue;
                    }
                };
                let ok = response.status().as_u16() == 200;
                let body = response.into_body().collect().await;
                if !ok || body.is_err() {
                    if errors.fetch_add(1, Ordering::Relaxed) < 3 {
                        if let Ok(b) = body {
                            eprintln!("error reply: {}", String::from_utf8_lossy(&b.to_bytes()));
                        }
                    }
                    continue;
                }
                if measuring.load(Ordering::Relaxed) {
                    completed.fetch_add(1, Ordering::Relaxed);
                    local.push(started.elapsed().as_micros() as u32);
                }
            }
            latencies.lock().unwrap().extend(local);
        }));
    }
    tokio::time::sleep(Duration::from_secs_f64(warmup)).await;
    let cpu_before: Vec<_> = pids.iter().map(|(_, pid)| (thread_cpu(*pid), user_sys(*pid))).collect();
    let started = Instant::now();
    measuring.store(true, Ordering::Relaxed);
    tokio::time::sleep(Duration::from_secs_f64(secs)).await;
    measuring.store(false, Ordering::Relaxed);
    let elapsed = started.elapsed().as_secs_f64();
    let cpu_after: Vec<_> = pids.iter().map(|(_, pid)| (thread_cpu(*pid), user_sys(*pid))).collect();
    stop.store(true, Ordering::Relaxed);
    for handle in handles {
        let _ = handle.await;
    }
    let count = completed.load(Ordering::Relaxed);
    let mut lat = latencies.lock().unwrap().clone();
    lat.sort_unstable();
    let pct = |p: f64| lat.get(((lat.len() as f64 * p) as usize).min(lat.len().saturating_sub(1))).copied().unwrap_or(0) as f64 / 1000.0;
    let mut procs = serde_json::Map::new();
    for (i, (name, pid)) in pids.iter().enumerate() {
        let (before, (u0, s0)) = &cpu_before[i];
        let (after, (u1, s1)) = &cpu_after[i];
        let mut threads: Vec<(String, f64)> = after
            .iter()
            .map(|(k, v)| (k.clone(), (*v - before.get(k).copied().unwrap_or(0)) as f64 / 1000.0 / count.max(1) as f64))
            .filter(|(_, us)| *us > 0.05)
            .collect();
        threads.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        let total: f64 = threads.iter().map(|(_, us)| us).sum();
        let main = threads.iter().find(|(k, _)| k.starts_with(&format!("{pid}:"))).map(|(_, us)| *us).unwrap_or(0.0);
        let round = |v: f64| (v * 10.0).round() / 10.0;
        procs.insert(
            name.clone(),
            serde_json::json!({
                "cpuUsPerTrack": round(total),
                "mainThreadUsPerTrack": round(main),
                "userUsPerTrack": round((u1 - u0) * 1e6 / count.max(1) as f64),
                "sysUsPerTrack": round((s1 - s0) * 1e6 / count.max(1) as f64),
                "cpuUtil": round(total * count as f64 / elapsed / 1e6 * 100.0),
                "threads": threads.iter().take(40).map(|(k, us)| serde_json::json!([k, round(*us)])).collect::<Vec<_>>(),
            }),
        );
    }
    println!(
        "{}",
        serde_json::json!({
            "label": label,
            "conns": conns,
            "tracks": count,
            "tracksPerSec": (count as f64 / elapsed).round(),
            "errors": errors.load(Ordering::Relaxed),
            "p50Ms": pct(0.5),
            "p99Ms": pct(0.99),
            "procs": procs,
        })
    );
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let threads: usize = arg(&args, "--threads").and_then(|v| v.parse().ok()).unwrap_or(2);
    let runtime = tokio::runtime::Builder::new_multi_thread().worker_threads(threads).enable_all().build().unwrap();
    runtime.block_on(async {
        match args.get(1).map(String::as_str) {
            Some("seq") => sequential(&args).await,
            _ => load(&args).await,
        }
    });
}
