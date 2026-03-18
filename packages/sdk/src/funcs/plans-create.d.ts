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
 * Create a plan
 *
 * @remarks
 * Creates a new plan with optional base price and feature configurations.
 *
 * Use this to programmatically create pricing plans. See [How plans work](/documentation/pricing/plans) for concepts.
 *
 * @example
 * ```typescript
 * // Create a free plan with limited features
 * const response = await client.plans.create({
 *   planId: "free_plan",
 *   name: "Free",
 *   autoEnable: true,
 *   items: [{"featureId":"messages","included":100,"reset":{"interval":"month"}}],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create a paid plan with base price and usage-based feature
 * const response = await client.plans.create({
 *   planId: "pro_plan",
 *   name: "Pro Plan",
 *   price: {"amount":10,"interval":"month"},
 *   items: [{"featureId":"messages","included":1000,"reset":{"interval":"month"},"price":{"amount":0.01,"interval":"month","billingUnits":1,"billingMethod":"usage_based"}}],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create a plan with prepaid seats
 * const response = await client.plans.create({
 *   planId: "team_plan",
 *   name: "Team Plan",
 *   price: {"amount":49,"interval":"month"},
 *   items: [{"featureId":"seats","included":5,"price":{"amount":10,"interval":"month","billingUnits":1,"billingMethod":"prepaid"}}],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create an add-on plan
 * const response = await client.plans.create({
 *   planId: "analytics_addon",
 *   name: "Advanced Analytics",
 *   addOn: true,
 *   price: {"amount":20,"interval":"month"},
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create a plan with tiered pricing
 * const response = await client.plans.create({ planId: "api_plan", name: "API Plan", items: [{"featureId":"api_calls","included":1000,"reset":{"interval":"month"},"price":{"tiers":[{"to":10000,"amount":0.001},{"to":100000,"amount":0.0005},{"to":"inf","amount":0.0001}],"interval":"month","billingUnits":1,"billingMethod":"usage_based"}}] });
 * ```
 *
 * @example
 * ```typescript
 * // Create a plan with free trial
 * const response = await client.plans.create({
 *   planId: "premium_plan",
 *   name: "Premium",
 *   price: {"amount":99,"interval":"month"},
 *   freeTrial: {"durationLength":14,"durationType":"day","cardRequired":true},
 * });
 * ```
 *
 * @param planId - The ID of the plan to create.
 * @param group - Group identifier for organizing related plans. Plans in the same group are mutually exclusive. (optional)
 * @param name - Display name of the plan.
 * @param description - Optional description of the plan. (optional)
 * @param addOn - If true, this plan can be attached alongside other plans. Otherwise, attaching replaces existing plans in the same group. (optional)
 * @param autoEnable - If true, plan is automatically attached when a customer is created. Use for free tiers. (optional)
 * @param price - Base recurring price for the plan. Omit for free or usage-only plans. (optional)
 * @param items - Feature configurations for this plan. Each item defines included units, pricing, and reset behavior. (optional)
 * @param freeTrial - Free trial configuration. Customers can try this plan before being charged. (optional)
 *
 * @returns The created plan object.
 */
export declare function plansCreate(client: AutumnCore, request: models.CreatePlanParams, options?: RequestOptions): APIPromise<Result<models.CreatePlanResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
