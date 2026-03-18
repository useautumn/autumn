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
 * Fetches an entity by its ID.
 *
 * Use this to read one entity's current state. Pass customerId when you want to scope the lookup to a specific customer.
 *
 * @example
 * ```typescript
 * // Fetch a seat entity
 * const response = await client.entities.get({ entityId: "seat_42" });
 * ```
 *
 * @example
 * ```typescript
 * // Fetch a seat entity for a specific customer
 * const response = await client.entities.get({ customerId: "cus_123", entityId: "seat_42" });
 * ```
 *
 * @param customerId - The ID of the customer to create the entity for. (optional)
 * @param entityId - The ID of the entity.
 *
 * @returns The entity object including its current subscriptions, purchases, and balances.
 */
export declare function entitiesGet(client: AutumnCore, request: models.GetEntityParams, options?: RequestOptions): APIPromise<Result<models.GetEntityResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
