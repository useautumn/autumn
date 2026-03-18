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
 * Updates an existing entity and returns the refreshed entity object.
 *
 * Use this to change entity billing controls or other mutable entity fields after the entity has already been created.
 *
 * @example
 * ```typescript
 * // Update a seat entity's billing controls
 * const response = await client.entities.update({ customerId: "cus_123", entityId: "seat_42", billingControls: {"spendLimits":[{"featureId":"messages","enabled":true,"overageLimit":25}]} });
 * ```
 *
 * @param customerId - The ID of the customer that owns the entity. (optional)
 * @param entityId - The ID of the entity.
 * @param billingControls - Billing controls to replace on the entity. (optional)
 *
 * @returns The updated entity object including its current subscriptions, purchases, and balances.
 */
export declare function entitiesUpdate(client: AutumnCore, request: models.UpdateEntityParams, options?: RequestOptions): APIPromise<Result<models.UpdateEntityResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
