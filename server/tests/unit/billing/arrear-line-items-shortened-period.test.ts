import { describe, expect, test } from "bun:test";
import { BillingVersion, EntInterval, ms } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems.js";

const PREVIOUS_ANCHOR = Date.UTC(2026, 0, 1);
const RENEWED_AT = Date.UTC(2026, 1, 1);
const NEW_ANCHOR = Date.UTC(2026, 1, 15);
const JUST_BEFORE_RESET = NEW_ANCHOR - ms.minutes(30);

/** A monthly sub created Jan 1 and renewed Feb 1, whose anchor then moved to Feb 15. */
const makeFixture = () => {
	const customerEntitlement = customerEntitlements.create({
		featureId: "messages",
		featureName: "Messages",
		allowance: 0,
		balance: -100,
		interval: EntInterval.Month,
		nextResetAt: NEW_ANCHOR,
	});
	const usagePrice = prices.createConsumable({
		id: "price_messages",
		featureId: "messages",
		entitlementId: customerEntitlement.entitlement.id,
	});
	const fullProduct = products.createFull({
		id: "pro",
		name: "Pro",
		prices: [usagePrice],
		entitlements: [customerEntitlement.entitlement],
		stripeProductId: "stripe_product_pro",
	});
	const customerProduct = customerProducts.create({
		id: "customer_product_pro",
		productId: fullProduct.id,
		product: fullProduct,
		customerEntitlements: [customerEntitlement],
		customerPrices: [prices.createCustomer({ price: usagePrice })],
	});
	const ctx = contexts.create({
		org: {
			...contexts.createOrg(),
			config: { disable_overage_billing: false },
		} as never,
	});
	const billingContext = contexts.createBilling({
		customerProducts: [customerProduct],
		currentEpochMs: JUST_BEFORE_RESET,
		billingCycleAnchorMs: NEW_ANCHOR,
		resetCycleAnchorMs: NEW_ANCHOR,
		billingVersion: BillingVersion.V2,
	});

	return { ctx, customerProduct, billingContext };
};

describe("arrear usage period after a billing cycle anchor move", () => {
	test("starts at the shortened period's start, not a cycle of the new anchor", () => {
		const { lineItems } = customerProductToArrearLineItems({
			...makeFixture(),
			options: { shortenedPeriodAnchorMs: PREVIOUS_ANCHOR },
		});

		expect(lineItems[0]?.context.effectivePeriod).toEqual({
			start: RENEWED_AT,
			end: JUST_BEFORE_RESET,
		});
	});

	test("without a shortened period, follows the billing cycle anchor", () => {
		const { lineItems } = customerProductToArrearLineItems(makeFixture());

		expect(lineItems[0]?.context.effectivePeriod?.start).toBe(
			Date.UTC(2026, 0, 15),
		);
	});
});
