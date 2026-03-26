import type { BeforeRequestContext, BeforeRequestHook } from "./types.js";

const DEFAULT_TIMEOUT_MS = 5000;
const AUTO_TIMEOUT_OPERATION_IDS = new Set(["check", "track"]);

export class TimeoutFixHook implements BeforeRequestHook {
  beforeRequest(hookCtx: BeforeRequestContext, request: Request): Request {
    let timeoutMs = hookCtx.options.timeoutMs;

    if ((!timeoutMs || timeoutMs <= 0) && AUTO_TIMEOUT_OPERATION_IDS.has(hookCtx.operationID))
      timeoutMs = DEFAULT_TIMEOUT_MS;

    if (!timeoutMs || timeoutMs <= 0) return request;

    const signal =
      typeof AbortSignal.any === "function"
        ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

    return new Request(request, {
      signal,
    });
  }
}
