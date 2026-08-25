import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
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
import { billingPlanToNextCycleLineItems } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCycleLineItems.js";
import { customerProductToInvoiceCreditLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToInvoiceCreditLineItems.js";

const SOURCE_A_INTERNAL_ID = "internal_feature_a";
const SOURCE_B_INTERNAL_ID = "internal_feature_b";
const PERIOD_START = Date.UTC(2026, 0, 1);
const PERIOD_END = Date.UTC(2026, 1, 1);

const sourceA = features.create({
	id: "feature_a",
	internalId: SOURCE_A_INTERNAL_ID,
	name: "Feature A",
});
const sourceB = features.create({
	id: "feature_b",
	internalId: SOURCE_B_INTERNAL_ID,
	name: "Feature B",
});

const makeFixture = ({
	balance,
	usageAttribution,
}: {
	balance: number;
	usageAttribution?: UsageAttribution;
}) => {
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_invoice_credits",
		featureId: "invoice_credits",
		internalFeatureId: "internal_invoice_credits",
		featureName: "Invoice credits",
		featureType: FeatureType.CreditSystem,
		featureConfig: { invoice_credit: true, schema: [] },
		allowance: 1_000,
		balance,
		interval: EntInterval.Month,
		nextResetAt: PERIOD_END,
	});
	if (usageAttribution) {
		customerEntitlement.usage_attribution = usageAttribution;
	}

	const fixedPrice = prices.createFixed({ id: "price_enterprise" });
	const fullProduct = products.createFull({
		id: "enterprise",
		name: "Enterprise",
		prices: [fixedPrice],
		entitlements: [customerEntitlement.entitlement],
		stripeProductId: "stripe_product_enterprise",
	});
	const customerProduct = customerProducts.create({
		id: "customer_product_enterprise",
		productId: fullProduct.id,
		product: fullProduct,
		customerEntitlements: [customerEntitlement],
		customerPrices: [prices.createCustomer({ price: fixedPrice })],
	});
	const ctx = contexts.create({
		features: [sourceA, sourceB],
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

describe("invoice credit line items", () => {
	test("renders source debits and offsets the funded credits", () => {
		const fixture = makeFixture({
			balance: 240,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 30_000, credits: 260 },
				[SOURCE_B_INTERNAL_ID]: { units: 5_000, credits: 500 },
			},
		});

		const result = customerProductToInvoiceCreditLineItems({
			...fixture,
			idempotencyScope: "invoice_123",
		});

		expect(
			result.lineItems.map((lineItem) => ({
				amount: lineItem.amount,
				description: lineItem.description,
				featureId: lineItem.context.feature?.id,
				discountable: lineItem.context.discountable,
			})),
		).toEqual([
			{
				amount: 260,
				description: "Feature A",
				featureId: "feature_a",
				discountable: false,
			},
			{
				amount: 500,
				description: "Feature B",
				featureId: "feature_b",
				discountable: false,
			},
			{
				amount: -760,
				description: "Credits applied",
				featureId: "invoice_credits",
				discountable: false,
			},
		]);
		expect(result.updateCustomerEntitlements).toHaveLength(1);
		expect(
			result.lineItems.every(
				(lineItem) => lineItem.amountAfterDiscountsFinalized === true,
			),
		).toBe(true);
		expect(result.updateCustomerEntitlements[0]?.updates).toMatchObject({
			balance: 1_000,
			usage_attribution: {},
		});
		expect(
			result.updateCustomerEntitlements[0]?.updates?.next_reset_at,
		).toBeGreaterThan(PERIOD_END);
	});

	test("leaves usage beyond the funded balance as overage", () => {
		const fixture = makeFixture({
			balance: -200,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 12_000, credits: 1_200 },
			},
		});

		const result = customerProductToInvoiceCreditLineItems({
			...fixture,
			idempotencyScope: "invoice_overage",
		});

		expect(result.lineItems.map((lineItem) => lineItem.amount)).toEqual([
			1_200, -1_000,
		]);
	});

	test("emits no lines for empty attribution but still prepares the reset", () => {
		const fixture = makeFixture({ balance: 1_000 });

		const result = customerProductToInvoiceCreditLineItems({
			...fixture,
			idempotencyScope: "invoice_empty",
		});

		expect(result.lineItems).toEqual([]);
		expect(result.updateCustomerEntitlements).toHaveLength(1);
	});

	test("fully offsets overage when overage billing is disabled", () => {
		const fixture = makeFixture({
			balance: -200,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 12_000, credits: 1_200 },
			},
		});

		const result = customerProductToInvoiceCreditLineItems({
			...fixture,
			fullyOffsetOverage: true,
		});

		expect(result.lineItems.map((lineItem) => lineItem.amount)).toEqual([
			1_200, -1_200,
		]);
	});

	test("uses stable line IDs for the same invoice", () => {
		const fixture = makeFixture({
			balance: 990,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 100, credits: 10 },
			},
		});

		const first = customerProductToInvoiceCreditLineItems({
			...fixture,
			idempotencyScope: "invoice_retry",
		});
		const second = customerProductToInvoiceCreditLineItems({
			...fixture,
			idempotencyScope: "invoice_retry",
		});

		expect(first.lineItems).toHaveLength(2);
		expect(first.lineItems.map((lineItem) => lineItem.id)).toEqual(
			second.lineItems.map((lineItem) => lineItem.id),
		);
	});

	test("projects the same debit and offset lines into the next invoice preview", () => {
		const fixture = makeFixture({
			balance: 960,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 200, credits: 40 },
			},
		});

		const result = billingPlanToNextCycleLineItems({
			ctx: fixture.ctx,
			customerProducts: [fixture.customerProduct],
			lineItemSpecs: [],
			autumnBillingPlan: { lineItems: [] } as unknown as AutumnBillingPlan,
			billingContext: fixture.billingContext,
			nextCycleStart: PERIOD_END,
			options: { chargeUsageLineItems: true },
		});

		expect(
			result.previewLineItems.map((lineItem) => ({
				featureId: lineItem.feature_id,
				description: lineItem.description,
				subtotal: lineItem.subtotal,
			})),
		).toEqual([
			{
				featureId: "feature_a",
				description: "Feature A",
				subtotal: 40,
			},
			{
				featureId: "invoice_credits",
				description: "Credits applied",
				subtotal: -40,
			},
		]);
		expect(result.subtotal).toBe(0);
		expect(result.total).toBe(0);
	});
});
