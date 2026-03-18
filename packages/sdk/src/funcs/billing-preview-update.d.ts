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
 * Previews the billing changes that would occur when updating a subscription, without actually making any changes.
 *
 * Use this endpoint to show customers prorated charges or refunds before confirming subscription modifications.
 *
 * @example
 * ```typescript
 * // Preview updating seat quantity
 * const response = await client.billing.previewUpdate({ customerId: "cus_123", planId: "pro_plan", featureQuantities: [{"featureId":"seats","quantity":15}] });
 * ```
 *
 * @param customerId - The ID of the customer to attach the plan to.
 * @param entityId - The ID of the entity to attach the plan to. (optional)
 * @param planId - The ID of the plan to update. Optional if subscription_id is provided, or if the customer has only one product. (optional)
 * @param featureQuantities - If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan. (optional)
 * @param version - The version of the plan to attach. (optional)
 * @param customize - Customize the plan to attach. Can override the price, items, free trial, or a combination. (optional)
 * @param invoiceMode - Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method. (optional)
 * @param prorationBehavior - How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges. (optional)
 * @param redirectMode - Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects. (optional)
 * @param subscriptionId - A unique ID to identify this subscription. Can be used to target specific subscriptions in update operations when a customer has multiple products with the same plan. (optional)
 * @param cancelAction - Action to perform for cancellation. 'cancel_immediately' cancels now with prorated refund, 'cancel_end_of_cycle' cancels at period end, 'uncancel' reverses a pending cancellation. (optional)
 * @param noBillingChanges - If true, the subscription is updated internally without applying billing changes in Stripe. (optional)
 *
 * @returns A preview response with line items showing prorated charges or credits for the proposed changes.
 */
export declare function billingPreviewUpdate(client: AutumnCore, request: models.PreviewUpdateParams, options?: RequestOptions): APIPromise<Result<models.PreviewUpdateResponse, AutumnError | ResponseValidationError | ConnectionError | RequestAbortedError | RequestTimeoutError | InvalidRequestError | UnexpectedClientError | SDKValidationError>>;
