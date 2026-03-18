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
 * Creates an entity for a customer and feature, then returns the entity with balances and subscriptions.
 *
 * Use entities when usage and access must be scoped to sub-resources (for example seats, projects, or workspaces) instead of only the customer.
 *
 * @example
 * ```typescript
 * // Create a seat entity
 * const response = await client.entities.create({
 *
 *   customerId: "cus_123",
 *   entityId: "seat_42",
 *   featureId: "seats",
 *   name: "Seat 42",
 * });
 * ```
 *
 * @param name - The name of the entity (optional)
 * @param featureId - The ID of the feature this entity is associated with
 * @param billingControls - Billing controls for the entity. (optional)
 * @param customerData - Customer attributes used to resolve the customer when customer_id is not provided. (optional)
 * @param customerId - The ID of the customer to create the entity for.
 * @param entityId - The ID of the entity.
 *
 * @returns The created entity object including its current subscriptions, purchases, and balances.
 */
export declare function entitiesCreate(client: AutumnCore, request: models.CreateEntityParams, options?: RequestOptions): APIPromise<Result<models.CreateEntityResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
