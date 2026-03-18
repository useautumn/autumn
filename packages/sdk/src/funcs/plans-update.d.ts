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
 * Update a plan
 *
 * @remarks
 * Updates an existing plan. Creates a new version unless `disableVersion` is set.
 *
 * Use this to modify plan properties, pricing, or feature configurations. See [Adding features to plans](/documentation/pricing/plan-features) for item configuration.
 *
 * @example
 * ```typescript
 * // Update plan name and price
 * const response = await client.plans.update({ planId: "pro_plan", name: "Pro Plan (Updated)", price: {"amount":15,"interval":"month"} });
 * ```
 *
 * @example
 * ```typescript
 * // Add a feature to an existing plan
 * const response = await client.plans.update({ planId: "pro_plan", items: [{"featureId":"messages","included":1000,"reset":{"interval":"month"}},{"featureId":"storage","included":10,"reset":{"interval":"month"}}] });
 * ```
 *
 * @example
 * ```typescript
 * // Remove the base price (make usage-only)
 * const response = await client.plans.update({ planId: "pro_plan", price: null });
 * ```
 *
 * @example
 * ```typescript
 * // Archive a plan
 * const response = await client.plans.update({ planId: "old_plan", archived: true });
 * ```
 *
 * @example
 * ```typescript
 * // Update feature's included amount
 * const response = await client.plans.update({ planId: "pro_plan", items: [{"featureId":"messages","included":2000,"reset":{"interval":"month"}}] });
 * ```
 *
 * @param planId - The ID of the plan to update.
 * @param group - Group identifier for organizing related plans. Plans in the same group are mutually exclusive. (optional)
 * @param name - Display name of the plan. (optional)
 * @param addOn - Whether the plan is an add-on. (optional)
 * @param autoEnable - Whether the plan is automatically enabled. (optional)
 * @param price - The price of the plan. Set to null to remove the base price. (optional)
 * @param items - Feature configurations for this plan. Each item defines included units, pricing, and reset behavior. (optional)
 * @param freeTrial - The free trial of the plan. Set to null to remove the free trial. (optional)
 * @param newPlanId - The new ID to use for the plan. Can only be updated if the plan has not been used by any customers. (optional)
 *
 * @returns The updated plan object.
 */
export declare function plansUpdate(client: AutumnCore, request: models.UpdatePlanParams, options?: RequestOptions): APIPromise<Result<models.UpdatePlanResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
