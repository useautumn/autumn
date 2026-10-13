//! One process-wide map of subject bytes every Atom thread reads; only a subject's owner thread writes it.
//! Callers pass the store pointer from `ns_create`, so copies of this library loaded per thread share one map.

use std::collections::HashMap;
use std::slice;
use std::sync::atomic::{AtomicI64, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

const SHARDS: usize = 64;
/// Header bytes a writer prefixes to each value; `customer_version` sits at this offset.
const CUSTOMER_VERSION_OFFSET: usize = 16;

struct Entry {
    seq: u64,
    bytes: Box<[u8]>,
}

pub struct Store {
    shards: Vec<RwLock<HashMap<Box<[u8]>, Arc<Entry>>>>,
    seq: AtomicU64,
    bytes: AtomicI64,
    entries: AtomicI64,
}

fn shard_of(key: &[u8]) -> usize {
    // FNV-1a: keys are short and this runs on every read.
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in key {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    (hash as usize) % SHARDS
}

unsafe fn bytes_of<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if len == 0 { &[] } else { slice::from_raw_parts(ptr, len) }
}

impl Store {
    fn insert(&self, key: &[u8], bytes: Box<[u8]>) -> u64 {
        let seq = self.seq.fetch_add(1, Ordering::Relaxed) + 1;
        let added = bytes.len() as i64;
        let entry = Arc::new(Entry { seq, bytes });
        let previous = self.shards[shard_of(key)].write().unwrap().insert(key.into(), entry);
        match previous {
            Some(old) => self.bytes.fetch_add(added - old.bytes.len() as i64, Ordering::Relaxed),
            None => {
                self.entries.fetch_add(1, Ordering::Relaxed);
                self.bytes.fetch_add(added, Ordering::Relaxed)
            }
        };
        seq
    }

    fn get(&self, key: &[u8]) -> Option<Arc<Entry>> {
        self.shards[shard_of(key)].read().unwrap().get(key).cloned()
    }
}

#[no_mangle]
pub extern "C" fn ns_create() -> *mut Store {
    Box::into_raw(Box::new(Store {
        shards: (0..SHARDS).map(|_| RwLock::new(HashMap::new())).collect(),
        seq: AtomicU64::new(0),
        bytes: AtomicI64::new(0),
        entries: AtomicI64::new(0),
    }))
}

/// Replaces the key's bytes; returns the new sequence number.
#[no_mangle]
pub unsafe extern "C" fn ns_put(store: *const Store, key: *const u8, key_len: usize, value: *const u8, value_len: usize) -> u64 {
    let store = &*store;
    store.insert(bytes_of(key, key_len), bytes_of(value, value_len).into())
}

/// -1: absent. -2: still at `known_seq`, nothing copied. Otherwise the value's length, copied into `out`
/// only when it fits in `out_cap` (the caller grows and retries otherwise); `seq_out` gets its sequence.
#[no_mangle]
pub unsafe extern "C" fn ns_get(store: *const Store, key: *const u8, key_len: usize, known_seq: u64, out: *mut u8, out_cap: usize, seq_out: *mut u64) -> i64 {
    let store = &*store;
    let Some(entry) = store.get(bytes_of(key, key_len)) else { return -1 };
    if entry.seq == known_seq { return -2 }
    let len = entry.bytes.len();
    if len <= out_cap {
        std::ptr::copy_nonoverlapping(entry.bytes.as_ptr(), out, len);
        *seq_out = entry.seq;
    }
    len as i64
}

/// The key's sequence number alone, 0 when absent.
#[no_mangle]
pub unsafe extern "C" fn ns_seq(store: *const Store, key: *const u8, key_len: usize) -> u64 {
    let store = &*store;
    store.get(bytes_of(key, key_len)).map_or(0, |entry| entry.seq)
}

/// Rewrites the header's customer version in place of a copy; returns the new sequence, 0 when absent.
#[no_mangle]
pub unsafe extern "C" fn ns_set_customer_version(store: *const Store, key: *const u8, key_len: usize, customer_version: i64) -> u64 {
    let store = &*store;
    let key = bytes_of(key, key_len);
    let Some(entry) = store.get(key) else { return 0 };
    let mut bytes: Box<[u8]> = entry.bytes.clone();
    if bytes.len() < CUSTOMER_VERSION_OFFSET + 8 { return 0 }
    bytes[CUSTOMER_VERSION_OFFSET..CUSTOMER_VERSION_OFFSET + 8].copy_from_slice(&customer_version.to_le_bytes());
    store.insert(key, bytes)
}

#[no_mangle]
pub unsafe extern "C" fn ns_delete(store: *const Store, key: *const u8, key_len: usize) -> i32 {
    let store = &*store;
    let removed = store.shards[shard_of(bytes_of(key, key_len))].write().unwrap().remove(bytes_of(key, key_len));
    match removed {
        Some(old) => {
            store.entries.fetch_sub(1, Ordering::Relaxed);
            store.bytes.fetch_sub(old.bytes.len() as i64, Ordering::Relaxed);
            1
        }
        None => 0,
    }
}

/// Removes every key starting with the prefix (a slot file closing); returns how many.
#[no_mangle]
pub unsafe extern "C" fn ns_delete_prefix(store: *const Store, prefix: *const u8, prefix_len: usize) -> i64 {
    let store = &*store;
    let prefix = bytes_of(prefix, prefix_len);
    let mut removed = 0i64;
    for shard in &store.shards {
        shard.write().unwrap().retain(|key, entry| {
            let keep = !key.starts_with(prefix);
            if !keep {
                removed += 1;
                store.bytes.fetch_sub(entry.bytes.len() as i64, Ordering::Relaxed);
            }
            keep
        });
    }
    store.entries.fetch_sub(removed, Ordering::Relaxed);
    removed
}

#[no_mangle]
pub unsafe extern "C" fn ns_bytes(store: *const Store) -> i64 {
    (*store).bytes.load(Ordering::Relaxed)
}

#[no_mangle]
pub unsafe extern "C" fn ns_entries(store: *const Store) -> i64 {
    (*store).entries.load(Ordering::Relaxed)
}
