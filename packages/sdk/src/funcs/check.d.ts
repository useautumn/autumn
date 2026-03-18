import { AutumnCore } from "../core.js";
import { RequestOptions } from "../lib/sdks.js";
import { AutumnError } from "../models/autumn-error.js";
import { ConnectionError, InvalidRequestError, RequestAbortedError, RequestTimeoutError, UnexpectedClientError } from "../models/http-client-errors.js";
import * as models from "../models/index.js";
import { ResponseValidationError } from "../models/response-validation-error.js";
import { SDKValidationError } from "../models/sdk-validation-error.js";
import { APIPromise } from "../types/async.js";
import { Result } from "../types/fp.js";
/**
 * Checks whether a customer currently has enough balance to use a feature.
 *
 * Use this to gate access before a feature action. Enable sendEvent when you want to check and consume balance atomically in one request.
 *
 * @example
 * ```typescript
 * // Check access for a feature
 * const response = await client.check({ customerId: "cus_123", featureId: "messages" });
 * ```
 *
 * @example
 * ```typescript
 * // Check and consume 3 units in one call
 * const response = await client.check({
 *
 *   customerId: "cus_123",
 *   featureId: "messages",
 *   requiredBalance: 3,
 *   sendEvent: true,
 * });
 * ```
 *
 * @param customerId - The ID of the customer.
 * @param featureId - The ID of the feature.
 * @param entityId - The ID of the entity for entity-scoped balances (e.g., per-seat limits). (optional)
 * @param requiredBalance - Minimum balance required for access. Returns allowed: false if the customer's balance is below this value. Defaults to 1. (optional)
 * @param properties - Additional properties to attach to the usage event if send_event is true. (optional)
 * @param sendEvent - If true, atomically records a usage event while checking access. The required_balance value is used as the usage amount. Combines check + track in one call. (optional)
 * @param lock - Reserve units of a feature upfront by passing a lock_id, then call balances.finalize to confirm or release the hold. (optional)
 * @param withPreview - If true, includes upgrade/upsell information in the response when access is denied. Useful for displaying paywalls. (optional)
 *
 * @returns Whether access is allowed, plus the current balance for that feature.
 */
export declare function check(client: AutumnCore, request: models.CheckParams, options?: RequestOptions): APIPromise<Result<models.CheckResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
