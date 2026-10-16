# @autumn/librdkafka

Every Kafka client in the repo runs on librdkafka through `@confluentinc/kafka-javascript@1.10.0`,
patched so its addon loads under Bun. `@autumn/kafka` is the only consumer; nothing else imports this
package directly.

## Building the addon

```sh
bun run --cwd packages/librdkafka build
```

Compiles once per build key (~15 min cold: librdkafka statically links its own OpenSSL, zstd and curl)
into `~/.cache/autumn-librdkafka/<key>.node`, then restores it in a second. The key hashes the patched
sources, platform, arch, glibc and C++ compiler (`bun run --cwd packages/librdkafka native:key`), so an addon
built on one base image never loads on another.

Where the cache lives:

- **Deploy image** (`build.yml`): the `autumn-librdkafka` BuildKit cache mount in `docker/Dockerfile`, kept
  between runs by the Blacksmith builder's sticky disk.
- **CI** (`librdkafka.yml`): `actions/cache` keyed on the build key. Its `image` job builds the deploy image on
  the same Blacksmith builder, so a patch change compiles in its PR and the deploy after merge restores it.
- **Capy machines**: `scripts/setup/capy-init.sh` builds it, and the machine snapshot keeps the cache.
- **twd** (`scripts/tw/image/warmup.sh`): compiling under Modal's gVisor outlives the warm, so `librdkafka.yml`'s `twd`
  job builds on twd's Debian base and publishes `<key>.node` as the `librdkafka-addon-<key>` release. The warm
  downloads it into `/opt/autumn-tw/librdkafka`, which its snapshot keeps.

`bun run --cwd packages/librdkafka probe:addon` (`PROBE_BROKERS`, default `127.0.0.1:9092`) loads the addon,
creates a topic and sends one record idempotently.
Importing the package never needs the addon; the first producer, consumer or admin does, and says so.
Needs a C/C++ toolchain, Python 3 and Perl (macOS: Xcode command line tools).

## The patch

`patches/@confluentinc%2Fkafka-javascript@1.10.0.patch` at the repo root is applied by `bun install`.
It is eight patches, kept here for provenance:

- `patches/pr471.patch`: upstream PR #471 (NAN → N-API) at `47334c9`, verbatim.
- `patches/bunUvToNapi.patch`: ours. Bun implements only `uv_mutex_*` of libuv; the addon's rwlocks,
  consume thread and two `uv_async_t` dispatchers move to `std::shared_mutex`, `std::thread` and N-API
  threadsafe functions.
- `patches/brokerWakeup.patch`: ours, in librdkafka itself. A seek or resume on a partition that is already
  fetching changes no fetch state, so nothing wakes a broker thread idling on IO and the refetch waited up
  to a second. Both now wake it.
- `patches/consumeErrorAfterRecords.patch`: ours. A batch consume that read an error after it already held
  records returned the records and dropped the error. librdkafka raises a consumer's fatal error exactly once,
  so the consumer stayed up owning nothing; the next consume now returns it.
- `patches/fatalErrorCause.patch`: ours. librdkafka queues a fatal error as a bare `ERR__FATAL` and keeps its
  cause on the handle. A consume now returns the cause (`GROUP_AUTHORIZATION_FAILED`, `FENCED_INSTANCE_ID`, …) with
  `isFatal: true`, so an owner can tell a broker refusal it should wait out from a client it should replace.
- `patches/lockPoolThreadCalls.patch`: ours. A consumer's seek, commit, committed and position run on pool
  threads and took no lock, so a disconnect could free the client under them; they now share the connection
  lock as consume does. Admin requests held it exclusively across their network wait, serializing every
  request on one client behind the slowest; they now share it too.
- `patches/adminEventInit.patch`: ours. The admin workers left their result event pointer uninitialized and
  destroyed it in their destructor, so an admin call that failed before polling (a client not connected)
  freed a garbage pointer: `double free or corruption` under a broker kill.
- `patches/leaderQueryOnMainThread.patch`: ours, in librdkafka. `query_leaders_async` ran its first pass on
  the caller's thread; with a partition leaderless it registered a metadata-cache observer and then replied,
  while a cache update on the main thread could fire that observer and reply too. Both destroyed the op: a
  double free in `rd_kafka_ListOffsets` under repeated broker kills. The first pass now runs on the main thread.

After editing any, `bun run --cwd packages/librdkafka patch:regenerate` rebuilds the root patch.
Drop ours once #471 (or its successor) lands upstream without libuv.
