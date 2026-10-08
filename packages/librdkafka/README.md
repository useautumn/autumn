# @autumn/librdkafka

Every Kafka client in the repo runs on librdkafka through `@confluentinc/kafka-javascript@1.10.0`,
patched so its addon loads under Bun. `@autumn/kafka` is the only consumer; nothing else imports this
package directly.

## Building the addon

```sh
bun run --cwd packages/librdkafka build
```

Compiles once per patched sources, platform and arch (~15 min cold: librdkafka statically links its own
OpenSSL, zstd and curl) into `~/.cache/autumn-librdkafka/<key>.node`, then restores it in a second.
Importing the package never needs the addon; the first producer, consumer or admin does, and says so.
Needs a C/C++ toolchain, Python 3 and Perl (macOS: Xcode command line tools).

## The patch

`patches/@confluentinc%2Fkafka-javascript@1.10.0.patch` at the repo root is applied by `bun install`.
It is two patches, kept here for provenance:

- `patches/pr471.patch`: upstream PR #471 (NAN → N-API) at `47334c9`, verbatim.
- `patches/bunUvToNapi.patch`: ours. Bun implements only `uv_mutex_*` of libuv; the addon's rwlocks,
  consume thread and two `uv_async_t` dispatchers move to `std::shared_mutex`, `std::thread` and N-API
  threadsafe functions.

After editing either, `bun run --cwd packages/librdkafka patch:regenerate` rebuilds the root patch.
Drop ours once #471 (or its successor) lands upstream without libuv.
