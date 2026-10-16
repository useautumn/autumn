# How this SDK patches the generated client

Speakeasy generates everything under `src/` except this folder. Each behavior below is one hook, registered in `registration.ts`. The Python SDK (`others/python-sdk/src/autumn_sdk/_hooks/`) mirrors it hook for hook; its names are in parentheses.

| Patch | What it does | When it applies | TypeScript | Python |
| --- | --- | --- | --- | --- |
| Fail-open | A fetch that throws becomes a 555 response (503 in Python). A 5xx on `check` or `track` becomes an allowing answer (`allowed: true`, `value: 0`) and is logged. | Always, unless `failOpen: false` (`fail_open=False`). | `failOpenHook.ts` | `fail_open_hook.py` |
| Edge routing | `check` and `balances.finalize` go to `edgeURL` first. When the edge is down (a 5xx it answered itself, no reply within 1 s, or a connection error) the same call goes to the Autumn API. Track never goes to the edge. The Python SDK still sends finalize to the Autumn API. | `useEdge` (`use_edge`), or `autumn.edge` (`client.edge`), with an `edgeURL` (`edge_url`). A per-call `serverURL` is left alone. | `edge/edgeHook.ts`, `edge/edgeHTTPClient.ts` | `edge_hook.py`, `edge_clients.py` |
| Idempotency key | A write (a finalize, or a check with `sendEvent: true` or `lock`) carries an `Idempotency-Key`: the caller's if set, else one UUID made once per call and resent on every retry and on the fallback, so Autumn applies the write once. A plain check never gets one. | `useEdge` (`use_edge`). | `idempotencyKeyHook.ts` | `idempotency_key_hook.py` |
| Default timeout | `check` and `track` get a 5 s timeout. | When the call and the client set none. | `timeoutFixHook.ts` | `timeout_hook.py` |
| Debug-log redaction | Masks the `Authorization` header before the debug logger prints request headers. | A `debugLogger`, or `AUTUMN_DEBUG`. | `redactDebugLogHook.ts` | none |
| Response buffering | Reads the response body while a timeout still rejects the call, instead of inside debug logging, which swallows it. | A `debugLogger`, non-streaming replies. | `bufferLoggedResponseHook.ts` | none |

Order matters in two places. Fail-open registers before the edge, because it replaces the HTTP client and the edge client wraps whatever is there. The key hook registers before the edge hook: in Python the edge hook returns a copy and every retry starts from the original request, so the key must already be on it.

## Generated-code patches

`.speakeasy/patches` re-applies on regeneration what the hooks need from the generated code: the `edgeURL` and `useEdge` options, and `autumn.edge` (`client.edge`), the same client with `useEdge` on.
