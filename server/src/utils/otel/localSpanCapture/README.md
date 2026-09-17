# Local benchmark span capture

From `server/`, with your usual **local** database/Redis configuration already loaded:

```sh
mkdir -p "$HOME/.capy/work/autumn-spans"
NODE_ENV=development AUTUMN_OTEL_LOCAL=true \
  AUTUMN_OTEL_LOCAL_DIR="$HOME/.capy/work/autumn-spans" \
  bun src/index.ts
```

Use the same variables with `bun src/workers.ts` for workers. Each process/restart writes
its own `spans-<pid>-<timestamp>-<random>.jsonl` file (mode 0600). The destination must
be explicitly set, absolute, and outside `/tmp`, including through symlinks. Do not
commit these files. Use synthetic benchmark inputs and local services only.

`AUTUMN_OTEL_LOCAL=true` requires `NODE_ENV=development` or `test`. It takes precedence
over Axiom credentials and disables remote **OpenTelemetry** traces, metrics, logs,
and AWS resource discovery. It does not disable application logging, other telemetry
systems, or application network calls. Leave `OTEL_SDK_DISABLED` unset or `false`.
Without this opt-in, the existing Axiom pipeline and disabled-without-token behavior
are unchanged. Unset `AUTUMN_OTEL_LOCAL` to return to the default.

Local mode uses an always-on sampler (even for unsampled incoming parents), bypasses
the successful Redis/Dynamo sampling and ingest compactor, and captures every ended
instrumented span subject to the bounded queue. Existing instrumentation exclusions
still apply; it does not add spans for uninstrumented code or skipped Redis commands.

Each JSON line has `version`, `processId`, `traceId`, `spanId`, nullable `parentSpanId`,
`name`, numeric OTel `kind`, `startTime` and `endTime` as `[Unix seconds, nanoseconds]`,
`durationMs`, `status.code` (0 unset, 1 OK, 2 error), and `attributes`. Join parent/child
spans by trace ID and span ID, not file order. Cross-process waterfalls require existing
trace-context propagation; missing propagation cannot be reconstructed from timestamps.

Only explicitly allowlisted operation names and enum/boolean/status attributes are
written. Unknown names become `redacted.<stable SHA-256 prefix>` so they can still be
grouped without recording paths or payloads. Raw SQL, parameters, URLs, headers, bodies,
tenant/customer identifiers, arbitrary attributes, resource attributes, events,
exception messages, status messages, and links are omitted. Review the serializer's
allowlists when adding operation labels; do not enable arbitrary strings for convenience.

The SDK batches at most 256 spans per write, every second, with an 8192-span pending
queue. Overflow drops spans rather than growing memory indefinitely. Writes are synchronous
once per batch, not per span, so there is no extra unbounded write queue. Disk failures
are reported through OTel diagnostics without dumping spans; failed batches are not retried.
Disk usage is not capped or rotated: stop capture and remove old files between runs.

SIGINT, SIGTERM, and natural process exit flush pending ended spans. A benchmark that
calls `process.exit()` must first `await otelSdk?.shutdown()` (imported from
`src/instrumentation.ts`); use shutdown only after work has finished. For intermediate
checkpoints, wait for the one-second batch interval. SIGKILL, crashes, forced exits, in-flight
spans, or shutdown races with other exit handlers can lose the final batch. Writes go
to the OS page cache, not an fsync durability guarantee.

Durations measure elapsed time, including network waits and scheduling, **not CPU time**.
Always-on instrumentation, serialization, and synchronous batch writes add overhead.
Compare like-for-like runs, repeat with capture disabled, and use a CPU profiler for CPU
attribution. Do not sum overlapping child durations as if they were serial CPU work.
