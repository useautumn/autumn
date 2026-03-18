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
 * Previews the billing changes that would occur when attaching multiple plans, without actually making any changes.
 *
 * Use this endpoint to show customers what they will be charged before confirming a multi-plan subscription.
 *
 * @example
 * ```typescript
 * // Preview attaching multiple plans
 * const response = await client.billing.previewMultiAttach({ customerId: "cus_123", plans: [{"planId":"pro_plan"},{"planId":"addon_seats","featureQuantities":[{"featureId":"seats","quantity":5}]}] });
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
 * @returns A preview response with line items, totals, and effective dates for the proposed multi-plan attachment.
 */
export declare function billingPreviewMultiAttach(client: AutumnCore, request: models.PreviewMultiAttachParams, options?: RequestOptions): APIPromise<Result<models.PreviewMultiAttachResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
