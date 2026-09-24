/**
 * Usage (in-arrear) line items get random ids by default, which makes it
 * impossible to tell on a webhook retry whether a line is already on the
 * Stripe invoice. When a scope (the Stripe invoice id) is provided, the id
 * must be a pure function of scope + customer price so a retry
 * regenerates the same id and can be matched against
 * metadata.autumn_line_item_id.
 */

import { describe, expect, test } from "bun:test";
import { BillingVersion, EntInterval } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems.js";

const PERIOD_START = Date.UTC(2026, 0, 1);
const PERIOD_END = Date.UTC(2026, 1, 1);

const makeFixture = () => {
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_messages",
		featureId: "messages",
		featureName: "Messages",
		allowance: 100,
		balance: -150,
		interval: EntInterval.Month,
		nextResetAt: PERIOD_END,
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
		currentEpochMs: PERIOD_END - 1,
		billingCycleAnchorMs: PERIOD_START,
		resetCycleAnchorMs: PERIOD_START,
		billingVersion: BillingVersion.V2,
	});

	return { ctx, customerProduct, billingContext };
};

describe("arrear line item ids", () => {
	test("are random when no scope is given", () => {
		const fixture = makeFixture();

		const first = customerProductToArrearLineItems({ ...fixture });
		const second = customerProductToArrearLineItems({ ...fixture });

		expect(first.lineItems).toHaveLength(1);
		expect(first.lineItems[0]?.id).not.toBe(second.lineItems[0]?.id);
	});

	test("are stable per scope and customer price", () => {
		const fixture = makeFixture();
		const options = { idempotencyScope: "in_cycle_123" };

		const first = customerProductToArrearLineItems({ ...fixture, options });
		const second = customerProductToArrearLineItems({ ...fixture, options });

		expect(first.lineItems).toHaveLength(1);
		expect(first.lineItems[0]?.id).toBe(
			"invoice_li_usage_in_cycle_123_cus_price_price_messages",
		);
		expect(second.lineItems[0]?.id).toBe(first.lineItems[0]?.id);
		expect(first.lineItems[0]?.amount).toBe(150);
	});

	test("differ across scopes so two invoices never share a line id", () => {
		const fixture = makeFixture();

		const first = customerProductToArrearLineItems({
			...fixture,
			options: { idempotencyScope: "in_cycle_1" },
		});
		const second = customerProductToArrearLineItems({
			...fixture,
			options: { idempotencyScope: "in_cycle_2" },
		});

		expect(first.lineItems[0]?.id).not.toBe(second.lineItems[0]?.id);
	});
});
