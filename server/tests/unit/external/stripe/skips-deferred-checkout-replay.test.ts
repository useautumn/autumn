/**
 * Deferred checkout.session.completed must not overwrite a later paid attach.
 *
 * Red (current): a newer paid product does not skip, so a retried
 * checkout.completed still runs modifyStripeSubscriptionFromCheckout.
 * Green (after): leftover free / same checkout plan still apply; a paid
 * product created after checkout skips.
 */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	CusProductStatus,
	type FullCusProduct,
	type Price,
	PriceType,
} from "@autumn/shared";
import { checkoutProductIdsFromDeferredData } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/checkoutProductIdsFromDeferredData.js";
import { skipsDeferredCheckoutReplay } from "@/external/stripe/webhookHandlers/handleStripeCheckoutSessionCompleted/tasks/handleCheckoutSessionMetadataV2/skipsDeferredCheckoutReplay.js";

const CHECKOUT_CREATED_AT_MS = 1_000_000;
const HOBBY_ID = "hobby";
const STANDARD_ID = "standard";
const FREE_ID = "free";

const paidPrice = (): Price => ({
	id: "pr_paid",
	org_id: "org_1",
	created_at: 1,
	internal_product_id: "ip_paid",
	is_custom: false,
	config: {
		type: PriceType.Fixed,
		amount: 20,
		interval: BillingInterval.Month,
		interval_count: 1,
		feature_id: null,
		internal_feature_id: null,
	},
	proration_config: null,
});

const makeCustomerProduct = ({
	productId,
	createdAt,
	status = CusProductStatus.Active,
	paid = true,
}: {
	productId: string;
	createdAt: number;
	status?: CusProductStatus;
	paid?: boolean;
}): FullCusProduct =>
	({
		id: `cp_${productId}`,
		status,
		created_at: createdAt,
		customer_prices: paid ? [{ price: paidPrice() }] : [],
		customer_entitlements: [],
		customer_licenses: [],
		product: { id: productId },
	}) as unknown as FullCusProduct;

describe("skipsDeferredCheckoutReplay", () => {
	test("applies when there is no live paid product (leftover free does not skip)", () => {
		const leftoverFree = makeCustomerProduct({
			productId: FREE_ID,
			createdAt: CHECKOUT_CREATED_AT_MS - 5_000,
			paid: false,
		});

		expect(
			skipsDeferredCheckoutReplay({
				liveCustomerProducts: [leftoverFree],
				checkoutProductIds: [HOBBY_ID],
				checkoutCreatedAtMs: CHECKOUT_CREATED_AT_MS,
			}),
		).toBe(false);
	});

	test("applies when the checkout plan is already the live paid product", () => {
		const checkoutPlan = makeCustomerProduct({
			productId: HOBBY_ID,
			createdAt: CHECKOUT_CREATED_AT_MS + 1_000,
		});

		expect(
			skipsDeferredCheckoutReplay({
				liveCustomerProducts: [checkoutPlan],
				checkoutProductIds: [HOBBY_ID],
				checkoutCreatedAtMs: CHECKOUT_CREATED_AT_MS,
			}),
		).toBe(false);
	});

	test("skips when a newer paid product replaced the checkout plan", () => {
		const leftoverFree = makeCustomerProduct({
			productId: FREE_ID,
			createdAt: CHECKOUT_CREATED_AT_MS - 5_000,
			paid: false,
		});
		const laterStandard = makeCustomerProduct({
			productId: STANDARD_ID,
			createdAt: CHECKOUT_CREATED_AT_MS + 10_000,
		});

		expect(
			skipsDeferredCheckoutReplay({
				liveCustomerProducts: [leftoverFree, laterStandard],
				checkoutProductIds: [HOBBY_ID],
				checkoutCreatedAtMs: CHECKOUT_CREATED_AT_MS,
			}),
		).toBe(true);
	});
});

describe("checkoutProductIdsFromDeferredData", () => {
	test("reads product ids from a well-formed deferred plan", () => {
		expect(
			checkoutProductIdsFromDeferredData({
				deferredData: {
					billingPlan: {
						autumn: {
							insertCustomerProducts: [
								{ product: { id: HOBBY_ID, name: "Hobby" } },
							],
						},
					},
				},
			}),
		).toEqual([HOBBY_ID]);
	});

	test("returns undefined when the deferred plan shape is unusable", () => {
		expect(
			checkoutProductIdsFromDeferredData({
				deferredData: { billingPlan: { autumn: {} } },
			}),
		).toBeUndefined();
		expect(
			checkoutProductIdsFromDeferredData({
				deferredData: {
					billingPlan: {
						autumn: {
							insertCustomerProducts: [{ product: { id: "" } }],
						},
					},
				},
			}),
		).toBeUndefined();
		expect(
			checkoutProductIdsFromDeferredData({
				deferredData: {
					billingPlan: { autumn: { insertCustomerProducts: [] } },
				},
			}),
		).toBeUndefined();
	});
});
