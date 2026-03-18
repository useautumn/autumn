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
 * Records usage for a customer feature and returns updated balances.
 *
 * Use this after an action happens to decrement usage, or send a negative value to credit balance back.
 *
 * @example
 * ```typescript
 * // Track one message event
 * const response = await client.track({ customerId: "cus_123", featureId: "messages", value: 1 });
 * ```
 *
 * @example
 * ```typescript
 * // Track an event mapped to multiple features
 * const response = await client.track({ customerId: "cus_123", eventName: "ai_chat_request", value: 1 });
 * ```
 *
 * @param customerId - The ID of the customer.
 * @param featureId - The ID of the feature to track usage for. Required if event_name is not provided. (optional)
 * @param entityId - The ID of the entity for entity-scoped balances (e.g., per-seat limits). (optional)
 * @param eventName - Event name to track usage for. Use instead of feature_id when multiple features should be tracked from a single event. (optional)
 * @param value - The amount of usage to record. Defaults to 1. Use negative values to credit balance (e.g., when removing a seat). (optional)
 * @param properties - Additional properties to attach to this usage event. (optional)
 *
 * @returns The usage value recorded, with either a single updated balance or a map of updated balances.
 */
export declare function track(client: AutumnCore, request: models.TrackParams, options?: RequestOptions): APIPromise<Result<models.TrackResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
