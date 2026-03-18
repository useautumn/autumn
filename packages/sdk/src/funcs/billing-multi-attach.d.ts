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
 * Attaches multiple plans to a customer in a single request. Creates a single Stripe subscription with all plans consolidated.
 *
 * Use this endpoint when you need to subscribe a customer to multiple plans at once, such as a base plan plus add-ons, or to create a bundle of products.
 *
 * @example
 * ```typescript
 * // Attach multiple plans to a customer
 * const response = await client.billing.multiAttach({ customerId: "cus_123", plans: [{"planId":"pro_plan"},{"planId":"addon_seats","featureQuantities":[{"featureId":"seats","quantity":5}]}] });
 * ```
 *
 * @example
 * ```typescript
 * // Attach with free trial applied to all plans
 * const response = await client.billing.multiAttach({ customerId: "cus_123", plans: [{"planId":"pro_plan"},{"planId":"addon_storage"}], freeTrial: {"durationLength":14,"durationType":"day"} });
 * ```
 *
 * @example
 * ```typescript
 * // Attach with custom pricing on one plan
 * const response = await client.billing.multiAttach({ customerId: "cus_123", plans: [{"planId":"pro_plan","customize":{"price":{"amount":4900,"interval":"month"}}},{"planId":"addon_support"}] });
 * ```
 *
 * @param customerId - The ID of the customer to attach the plans to.
 * @param entityId - The ID of the entity to attach the plans to. (optional)
 * @param plans - The list of plans to attach to the customer.
 * @param freeTrial - Free trial configuration applied to all plans. Pass an object to set a custom trial, or null to remove any trial. (optional)
 * @param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. (optional)
 * @param discounts - List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code. (optional)
 * @param successUrl - URL to redirect to after successful checkout. (optional)
 * @param checkoutSessionParams - Additional parameters to pass into the creation of the Stripe checkout session. (optional)
 * @param redirectMode - Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects. (optional)
 * @param newBillingSubscription - Only applicable when the customer has an existing Stripe subscription. If true, creates a new separate subscription instead of merging into the existing one. (optional)
 *
 * @returns A billing response with customer ID, invoice details, and payment URL (if checkout required).
 */
export declare function billingMultiAttach(client: AutumnCore, request: models.MultiAttachParams, options?: RequestOptions): APIPromise<Result<models.MultiAttachResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
