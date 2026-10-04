//! Rust front for the balance worker spike: HTTP in, batched decide frames to Bun over a unix socket,
//! HTTP replies out; optionally the partition's Kafka produce (rdkafka) for records Bun encodes.
use std::cell::{Cell, RefCell};
use std::convert::Infallible;
use std::rc::Rc;

use bytes::{Buf, BufMut, Bytes, BytesMut};
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::header::{HeaderValue, CONTENT_TYPE};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, UnixStream};
use tokio::sync::{oneshot, Notify};

pub const T_DECIDE: u8 = 1;
pub const T_RESULTS: u8 = 2;
pub const T_APPEND: u8 = 3;
pub const T_APPEND_ACK: u8 = 4;

const KIND_TRACK: u8 = 1;
const KIND_CHECK: u8 = 2;

#[cfg(feature = "kafka")]
mod kafka;

type Reply = (u16, Bytes);

#[derive(Deserialize)]
struct Route<'a> {
    partition: u32,
    #[serde(rename = "routeEpoch", borrow)]
    route_epoch: std::borrow::Cow<'a, str>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope<'a> {
    #[serde(borrow)]
    route: Route<'a>,
    #[serde(borrow)]
    command: &'a serde_json::value::RawValue,
}

/// Decides waiting to cross to Bun: one frame per writer turn, however many requests arrived meanwhile.
struct Core {
    decide: RefCell<BytesMut>,
    decide_count: Cell<u32>,
    /// Complete frames (append acks) that go out ahead of the next decide frame.
    control: RefCell<BytesMut>,
    pending: RefCell<Vec<Option<oneshot::Sender<Reply>>>>,
    free: RefCell<Vec<u32>>,
    notify: Notify,
    frames: Cell<u64>,
    decides: Cell<u64>,
}

impl Core {
    fn new() -> Self {
        Core {
            decide: RefCell::new(BytesMut::with_capacity(1 << 20)),
            decide_count: Cell::new(0),
            control: RefCell::new(BytesMut::with_capacity(1 << 12)),
            pending: RefCell::new(Vec::with_capacity(4096)),
            free: RefCell::new(Vec::with_capacity(4096)),
            notify: Notify::new(),
            frames: Cell::new(0),
            decides: Cell::new(0),
        }
    }

    fn slot(&self, tx: oneshot::Sender<Reply>) -> u32 {
        if let Some(id) = self.free.borrow_mut().pop() {
            self.pending.borrow_mut()[id as usize] = Some(tx);
            return id;
        }
        let mut pending = self.pending.borrow_mut();
        pending.push(Some(tx));
        (pending.len() - 1) as u32
    }

    fn settle(&self, id: u32, reply: Reply) {
        let tx = self.pending.borrow_mut().get_mut(id as usize).and_then(Option::take);
        if let Some(tx) = tx {
            self.free.borrow_mut().push(id);
            let _ = tx.send(reply);
        }
    }

    fn enqueue(&self, kind: u8, route: &Route, budget_ms: u32, command: &[u8], tx: oneshot::Sender<Reply>) {
        let id = self.slot(tx);
        let mut out = self.decide.borrow_mut();
        if self.decide_count.get() == 0 {
            out.put_u32_le(0);
            out.put_u8(T_DECIDE);
            out.put_u32_le(0);
        }
        out.put_u32_le(id);
        out.put_u8(kind);
        out.put_u32_le(route.partition);
        out.put_u32_le(budget_ms);
        out.put_u16_le(route.route_epoch.len() as u16);
        out.put_slice(route.route_epoch.as_bytes());
        out.put_u32_le(command.len() as u32);
        out.put_slice(command);
        self.decide_count.set(self.decide_count.get() + 1);
        drop(out);
        self.notify.notify_one();
    }

    /// Everything waiting, as bytes for one write: control frames, then the decide frame with its header patched.
    fn take(&self) -> BytesMut {
        let mut control = self.control.borrow_mut();
        let count = self.decide_count.replace(0);
        let mut out = if control.is_empty() { BytesMut::new() } else { control.split() };
        if count > 0 {
            let mut decide = self.decide.borrow_mut().split();
            let len = (decide.len() - 4) as u32;
            decide[0..4].copy_from_slice(&len.to_le_bytes());
            decide[5..9].copy_from_slice(&count.to_le_bytes());
            self.frames.set(self.frames.get() + 1);
            self.decides.set(self.decides.get() + count as u64);
            if out.is_empty() {
                out = decide;
            } else {
                out.unsplit(decide);
            }
        }
        out
    }
}

fn json_response(status: u16, body: Bytes) -> Response<Full<Bytes>> {
    let mut response = Response::new(Full::new(body));
    *response.status_mut() = StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
    response.headers_mut().insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    response
}

const INVALID: &[u8] = br#"{"error":{"code":"INVALID_REQUEST","message":"Invalid request"}}"#;
const NOT_FOUND: &[u8] = br#"{"error":{"code":"NOT_FOUND","message":"Not found"}}"#;
const UNAVAILABLE: &[u8] = br#"{"error":{"code":"NOT_READY","message":"Decide core unavailable"}}"#;

async fn handle(core: Rc<Core>, request: Request<Incoming>) -> Result<Response<Full<Bytes>>, Infallible> {
    let kind = match (request.method(), request.uri().path()) {
        (&Method::POST, "/v1/track") => KIND_TRACK,
        (&Method::POST, "/v1/check") => KIND_CHECK,
        // Production: every other route is proxied to Bun's own HTTP app.
        _ => return Ok(json_response(404, Bytes::from_static(NOT_FOUND))),
    };
    let budget_ms = request
        .headers()
        .get("x-request-budget-ms")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(0);
    let body = match request.into_body().collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => return Ok(json_response(400, Bytes::from_static(INVALID))),
    };
    let (tx, rx) = oneshot::channel();
    match serde_json::from_slice::<Envelope>(&body) {
        Ok(envelope) => core.enqueue(kind, &envelope.route, budget_ms, envelope.command.get().as_bytes(), tx),
        Err(_) => return Ok(json_response(400, Bytes::from_static(INVALID))),
    }
    let (status, reply) = rx.await.unwrap_or((503, Bytes::from_static(UNAVAILABLE)));
    Ok(json_response(status, reply))
}

async fn write_loop(core: Rc<Core>, mut writer: tokio::net::unix::OwnedWriteHalf) {
    loop {
        core.notify.notified().await;
        loop {
            let out = core.take();
            if out.is_empty() {
                break;
            }
            if writer.write_all(&out).await.is_err() {
                eprintln!("decide core write failed");
                std::process::exit(1);
            }
        }
    }
}

async fn read_loop(
    core: Rc<Core>,
    mut reader: tokio::net::unix::OwnedReadHalf,
    #[allow(unused)] appends: Option<std::sync::mpsc::Sender<Bytes>>,
) {
    let mut buf = BytesMut::with_capacity(1 << 20);
    loop {
        match reader.read_buf(&mut buf).await {
            Ok(0) | Err(_) => {
                eprintln!("decide core closed");
                std::process::exit(1);
            }
            Ok(_) => {}
        }
        while buf.len() >= 4 {
            let len = u32::from_le_bytes(buf[0..4].try_into().unwrap()) as usize;
            if buf.len() < 4 + len {
                buf.reserve(4 + len - buf.len());
                break;
            }
            let mut frame = buf.split_to(4 + len).freeze();
            frame.advance(4);
            match frame.get_u8() {
                T_RESULTS => {
                    let count = frame.get_u32_le();
                    for _ in 0..count {
                        let id = frame.get_u32_le();
                        let status = frame.get_u16_le();
                        let body_len = frame.get_u32_le() as usize;
                        let body = frame.split_to(body_len);
                        core.settle(id, (status, body));
                    }
                }
                T_APPEND => match &appends {
                    Some(tx) => {
                        let _ = tx.send(frame);
                    }
                    None => {
                        eprintln!("append frame without --kafka");
                        std::process::exit(1);
                    }
                },
                other => {
                    eprintln!("unknown frame type {other}");
                    std::process::exit(1);
                }
            }
        }
    }
}

fn arg(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let listen = arg(&args, "--listen").unwrap_or_else(|| "127.0.0.1:8092".into());
    let socket = arg(&args, "--core").unwrap_or_else(|| "/tmp/bw-decide.sock".into());
    let kafka_mode = arg(&args, "--kafka");
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
    let local = tokio::task::LocalSet::new();
    local.block_on(&runtime, async move {
        let core = Rc::new(Core::new());
        let stream = UnixStream::connect(&socket).await.expect("connect decide core");
        let (reader, writer) = stream.into_split();

        let appends = match kafka_mode {
            #[cfg(feature = "kafka")]
            Some(mode) => {
                let (acks_tx, mut acks_rx) = tokio::sync::mpsc::unbounded_channel::<Bytes>();
                let tx = kafka::spawn(kafka::Config::from_args(&args, &mode), acks_tx);
                let core_for_acks = core.clone();
                tokio::task::spawn_local(async move {
                    while let Some(frame) = acks_rx.recv().await {
                        core_for_acks.control.borrow_mut().extend_from_slice(&frame);
                        core_for_acks.notify.notify_one();
                    }
                });
                Some(tx)
            }
            #[cfg(not(feature = "kafka"))]
            Some(_) => panic!("built without kafka"),
            None => None,
        };

        tokio::task::spawn_local(write_loop(core.clone(), writer));
        tokio::task::spawn_local(read_loop(core.clone(), reader, appends));
        let stats_core = core.clone();
        tokio::task::spawn_local(async move {
            let mut last = (0u64, 0u64);
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                let now = (stats_core.frames.get(), stats_core.decides.get());
                if now.0 > last.0 {
                    eprintln!(
                        "front: {} decides in {} frames (avg {:.1}/frame)",
                        now.1 - last.1,
                        now.0 - last.0,
                        (now.1 - last.1) as f64 / (now.0 - last.0) as f64
                    );
                }
                last = now;
            }
        });

        let listener = TcpListener::bind(&listen).await.expect("bind");
        eprintln!("front listening on {listen}, core {socket}");
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(accepted) => accepted,
                Err(_) => continue,
            };
            stream.set_nodelay(true).ok();
            let core = core.clone();
            tokio::task::spawn_local(async move {
                let service = service_fn(move |request| handle(core.clone(), request));
                let _ = http1::Builder::new().keep_alive(true).serve_connection(TokioIo::new(stream), service).await;
            });
        }
    });
}
