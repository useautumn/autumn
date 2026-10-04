//! The partition's Kafka produce: Bun hands over encoded records, this thread commits them and acks the base offset.
use std::time::Duration;

use bytes::{Buf, BufMut, Bytes, BytesMut};
use rdkafka::config::ClientConfig;
use rdkafka::producer::{FutureProducer, FutureRecord, Producer};
use rdkafka::util::Timeout;

use crate::T_APPEND_ACK;

pub struct Config {
    brokers: String,
    transactional_id: Option<String>,
    compression: String,
}

impl Config {
    pub fn from_args(args: &[String], mode: &str) -> Self {
        let arg = |name: &str| crate::arg(args, name);
        Config {
            brokers: arg("--brokers").unwrap_or_else(|| "127.0.0.1:19092".into()),
            transactional_id: (mode == "txn").then(|| arg("--transactional-id").unwrap_or_else(|| "bw-spike-front".into())),
            compression: arg("--compression").unwrap_or_else(|| "gzip".into()),
        }
    }
}

pub fn spawn(config: Config, acks: tokio::sync::mpsc::UnboundedSender<Bytes>) -> std::sync::mpsc::Sender<Bytes> {
    let (tx, rx) = std::sync::mpsc::channel::<Bytes>();
    let mut client = ClientConfig::new();
    client
        .set("bootstrap.servers", &config.brokers)
        .set("enable.idempotence", "true")
        .set("max.in.flight.requests.per.connection", "1")
        .set("acks", "all")
        .set("compression.type", &config.compression)
        .set("linger.ms", "0")
        .set("batch.num.messages", "10000");
    if let Some(id) = &config.transactional_id {
        client.set("transactional.id", id).set("transaction.timeout.ms", "30000");
    }
    let producer: FutureProducer = client.create().expect("kafka producer");
    let transactional = config.transactional_id.is_some();
    if transactional {
        producer.init_transactions(Timeout::After(Duration::from_secs(30))).expect("init transactions");
    }
    std::thread::Builder::new()
        .name("kafka-append".into())
        .spawn(move || {
            while let Ok(frame) = rx.recv() {
                let (append_id, result) = append(&producer, transactional, frame);
                let mut ack = BytesMut::with_capacity(32);
                match result {
                    Ok(base) => {
                        ack.put_u32_le(1 + 4 + 1 + 8);
                        ack.put_u8(T_APPEND_ACK);
                        ack.put_u32_le(append_id);
                        ack.put_u8(1);
                        ack.put_i64_le(base);
                    }
                    Err(error) => {
                        let bytes = error.as_bytes();
                        ack.put_u32_le((1 + 4 + 1 + 4 + bytes.len()) as u32);
                        ack.put_u8(T_APPEND_ACK);
                        ack.put_u32_le(append_id);
                        ack.put_u8(0);
                        ack.put_u32_le(bytes.len() as u32);
                        ack.put_slice(bytes);
                    }
                }
                if acks.send(ack.freeze()).is_err() {
                    return;
                }
            }
        })
        .unwrap();
    tx
}

fn append(producer: &FutureProducer, transactional: bool, mut frame: Bytes) -> (u32, Result<i64, String>) {
    let append_id = frame.get_u32_le();
    let partition = frame.get_u32_le() as i32;
    let topic_len = frame.get_u16_le() as usize;
    let topic = String::from_utf8_lossy(&frame.split_to(topic_len)).into_owned();
    let count = frame.get_u32_le();
    let result = (|| {
        if transactional {
            producer.begin_transaction().map_err(|e| e.to_string())?;
        }
        let mut deliveries = Vec::with_capacity(count as usize);
        for _ in 0..count {
            let key_len = frame.get_u32_le() as usize;
            let key = frame.split_to(key_len);
            let value_len = frame.get_u32_le() as usize;
            let value = frame.split_to(value_len);
            let record = FutureRecord::to(&topic).key(&key[..]).payload(&value[..]).partition(partition);
            deliveries.push(producer.send_result(record).map_err(|(e, _)| e.to_string())?);
        }
        let mut base = None;
        for delivery in deliveries {
            let delivered = futures::executor::block_on(delivery).map_err(|_| "delivery cancelled".to_string())?;
            let delivered = delivered.map_err(|(e, _)| e.to_string())?;
            base.get_or_insert(delivered.offset);
        }
        if transactional {
            producer
                .commit_transaction(Timeout::After(Duration::from_secs(30)))
                .map_err(|e| e.to_string())?;
        }
        base.ok_or_else(|| "empty append".to_string())
    })();
    (append_id, result)
}
