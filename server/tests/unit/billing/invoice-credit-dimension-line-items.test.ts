/**
 * Invoice credits with dimensions: attribution keyed per dimension renders one
 * line per (feature, dimension) without collapsing lines that share a feature,
 * names the dimension in the description, and still says "Removed feature"
 * only when the feature itself is gone.
 */

import { describe, expect, test } from "bun:test";
import {
	BillingVersion,
	EntInterval,
	FeatureType,
	type UsageAttribution,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems.js";

const CPU_INTERNAL_ID = "internal_cpu_minutes";
const PERIOD_START = Date.UTC(2026, 0, 1);
const PERIOD_END = Date.UTC(2026, 1, 1);

const cpuMinutes = features.create({
	id: "cpu_minutes",
	internalId: CPU_INTERNAL_ID,
	name: "CPU minutes",
});

const lineItemsFor = ({
	usageAttribution,
	catalogFeatures = [cpuMinutes],
}: {
	usageAttribution: UsageAttribution;
	catalogFeatures?: (typeof cpuMinutes)[];
}) => {
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_invoice_credits",
		featureId: "invoice_credits",
		internalFeatureId: "internal_invoice_credits",
		featureName: "Invoice credits",
		featureType: FeatureType.CreditSystem,
		featureConfig: { invoice_credit: true, schema: [] },
		allowance: 1_000,
		balance: 1_000 - 260,
		interval: EntInterval.Month,
		nextResetAt: PERIOD_END,
	});
	customerEntitlement.usage_attribution = usageAttribution;

	const invoiceCreditPrice = prices.createConsumable({
		id: "price_invoice_credits",
		featureId: "invoice_credits",
		internalFeatureId: "internal_invoice_credits",
		entitlementId: customerEntitlement.entitlement.id,
	});
	const fullProduct = products.createFull({
		id: "enterprise",
		name: "Enterprise",
		prices: [invoiceCreditPrice],
		entitlements: [customerEntitlement.entitlement],
		stripeProductId: "stripe_product_enterprise",
	});
	const customerProduct = customerProducts.create({
		id: "customer_product_enterprise",
		productId: fullProduct.id,
		product: fullProduct,
		customerEntitlements: [customerEntitlement],
		customerPrices: [prices.createCustomer({ price: invoiceCreditPrice })],
	});
	const ctx = contexts.create({
		features: catalogFeatures,
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

	return customerProductToArrearLineItems({
		ctx,
		customerProduct,
		billingContext,
		options: { invoiceCredits: { idempotencyScope: "invoice_1" } },
	}).invoiceCreditLineItems.map((lineItem) => ({
		id: lineItem.id,
		amount: lineItem.amount,
		description: lineItem.description,
		featureId: lineItem.context.feature?.id,
	}));
};

describe("invoice credit dimension line items", () => {
	test("renders one line per dimension of the same feature, then the offset", () => {
		expect(
			lineItemsFor({
				usageAttribution: {
					[`${CPU_INTERNAL_ID}::large_eu`]: { units: 10, credits: 60 },
					[`${CPU_INTERNAL_ID}::large`]: { units: 10, credits: 160 },
					[CPU_INTERNAL_ID]: { units: 40, credits: 40 },
				},
			}),
		).toEqual([
			{
				id: `invoice_li_credit_invoice_1_customer_entitlement_invoice_credits_${CPU_INTERNAL_ID}`,
				amount: 40,
				description: "CPU minutes, 40 units",
				featureId: "cpu_minutes",
			},
			{
				id: `invoice_li_credit_invoice_1_customer_entitlement_invoice_credits_${CPU_INTERNAL_ID}::large`,
				amount: 160,
				description: "CPU minutes — large, 10 units",
				featureId: "cpu_minutes",
			},
			{
				id: `invoice_li_credit_invoice_1_customer_entitlement_invoice_credits_${CPU_INTERNAL_ID}::large_eu`,
				amount: 60,
				description: "CPU minutes — large_eu, 10 units",
				featureId: "cpu_minutes",
			},
			{
				id: "invoice_li_credit_invoice_1_customer_entitlement_invoice_credits_applied",
				amount: -260,
				description: "Credits applied",
				featureId: "invoice_credits",
			},
		]);
	});

	test("a dimension on a removed feature still says Removed feature, never the credit feature", () => {
		const [line] = lineItemsFor({
			usageAttribution: {
				[`${CPU_INTERNAL_ID}::large`]: { units: 10, credits: 160 },
			},
			catalogFeatures: [],
		});

		expect(line).toMatchObject({
			description: "Removed feature — large, 10 units",
			featureId: "invoice_credits",
		});
	});
});
