import type { RequestInput } from "../lib/http.js";
import type {
  BeforeCreateRequestContext,
  BeforeCreateRequestHook,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 5000;
const AUTO_TIMEOUT_OPERATION_IDS = new Set(["check", "track"]);

export class TimeoutFixHook implements BeforeCreateRequestHook {
  beforeCreateRequest(
    hookCtx: BeforeCreateRequestContext,
    input: RequestInput,
  ): RequestInput {
    if (
      input.options?.signal
      || !AUTO_TIMEOUT_OPERATION_IDS.has(hookCtx.operationID)
    ) {
      return input;
    }

    return {
      ...input,
      options: {
        ...input.options,
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      },
    };
  }
}
