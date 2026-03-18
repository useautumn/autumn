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
 * Deletes an entity by entity ID.
 *
 * Use this when the underlying resource is removed and you no longer want entity-scoped balances or subscriptions tracked for it.
 *
 * @example
 * ```typescript
 * // Delete a seat entity
 * const response = await client.entities.delete({ entityId: "seat_42" });
 * ```
 *
 * @param customerId - The ID of the customer. (optional)
 * @param entityId - The ID of the entity.
 *
 * @returns A success flag indicating the entity was deleted.
 */
export declare function entitiesDelete(client: AutumnCore, request: models.DeleteEntityParams, options?: RequestOptions): APIPromise<Result<models.DeleteEntityResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
