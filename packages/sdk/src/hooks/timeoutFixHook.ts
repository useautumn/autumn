import type { BeforeRequestContext, BeforeRequestHook } from "./types.js";

export class TimeoutFixHook implements BeforeRequestHook {
  beforeRequest(hookCtx: BeforeRequestContext, request: Request): Request {
    const timeoutMs = hookCtx.options.timeoutMs;

    if (!timeoutMs || timeoutMs <= 0) {
      return request;
    }

    const signal =
      typeof AbortSignal.any === "function"
        ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

    return new Request(request, {
      signal,
    });
  }
}
