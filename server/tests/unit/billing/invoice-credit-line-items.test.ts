import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	BillingVersion,
	type CreditSchemaItem,
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
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems.js";
import { lineItemsToCreateInvoiceItemsParams } from "@/internal/billing/v2/providers/stripe/utils/invoiceLines/lineItemsToCreateInvoiceItemsParams.js";
import { billingPlanToNextCycleLineItems } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/billingPlanToNextCycleLineItems.js";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems.js";
import { getFinalUsageInvoicePreview } from "@/internal/customers/cusUtils/cusResponseUtils/getFinalUsageInvoicePreview.js";

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
	creditSchema = [],
}: {
	balance: number;
	usageAttribution?: UsageAttribution;
	creditSchema?: CreditSchemaItem[];
}) => {
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_invoice_credits",
		featureId: "invoice_credits",
		internalFeatureId: "internal_invoice_credits",
		featureName: "Invoice credits",
		featureType: FeatureType.CreditSystem,
		featureConfig: { invoice_credit: true, schema: creditSchema },
		allowance: 1_000,
		balance,
		interval: EntInterval.Month,
		nextResetAt: PERIOD_END,
	});
	if (usageAttribution) {
		customerEntitlement.usage_attribution = usageAttribution;
	}

	const fixedPrice = prices.createFixed({ id: "price_enterprise" });
	const invoiceCreditPrice = prices.createConsumable({
		id: "price_invoice_credits",
		featureId: "invoice_credits",
		internalFeatureId: "internal_invoice_credits",
		entitlementId: customerEntitlement.entitlement.id,
	});
	const fullProduct = products.createFull({
		id: "enterprise",
		name: "Enterprise",
		prices: [fixedPrice, invoiceCreditPrice],
		entitlements: [customerEntitlement.entitlement],
		stripeProductId: "stripe_product_enterprise",
	});
	const customerProduct = customerProducts.create({
		id: "customer_product_enterprise",
		productId: fullProduct.id,
		product: fullProduct,
		customerEntitlements: [customerEntitlement],
		customerPrices: [
			prices.createCustomer({ price: fixedPrice }),
			prices.createCustomer({ price: invoiceCreditPrice }),
		],
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
	test("describes flat usage with its unit quantity", () => {
		const fixture = makeFixture({
			balance: 990,
			creditSchema: [
				{
					metered_feature_id: sourceA.id,
					feature_amount: 1,
					credit_amount: 0.2,
				},
			],
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 50, credits: 10 },
			},
		});

		const result = customerProductToArrearLineItems({
			...fixture,
			options: {
				invoiceCredits: { idempotencyScope: "invoice_flat_description" },
			},
		});
		const stripeInvoiceItem = lineItemsToCreateInvoiceItemsParams({
			stripeCustomerId: "stripe_customer",
			stripeInvoiceId: "stripe_invoice",
			lineItems: result.invoiceCreditLineItems,
		})[0];

		expect(result.invoiceCreditLineItems[0]?.description).toBe(
			"Feature A, 50 units",
		);
		expect(stripeInvoiceItem).toMatchObject({
			description: "Feature A, 50 units",
			amount: 1_000,
		});
		expect(stripeInvoiceItem?.quantity).toBeUndefined();
		expect(stripeInvoiceItem?.price_data).toBeUndefined();
	});

	test("describes graduated usage with its unit quantity", () => {
		const fixture = makeFixture({
			balance: 860,
			creditSchema: [
				{
					metered_feature_id: sourceA.id,
					feature_amount: 100,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_amount: 1 },
						{ to: "inf", credit_amount: 0.8 },
					],
				},
			],
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 15_000, credits: 140 },
			},
		});

		const result = customerProductToArrearLineItems({
			...fixture,
			options: {
				invoiceCredits: {
					idempotencyScope: "invoice_graduated_description",
				},
			},
		});
		const stripeInvoiceItem = lineItemsToCreateInvoiceItemsParams({
			stripeCustomerId: "stripe_customer",
			stripeInvoiceId: "stripe_invoice",
			lineItems: result.invoiceCreditLineItems,
		})[0];

		expect(result.invoiceCreditLineItems[0]?.description).toBe(
			"Feature A, 15,000 units",
		);
		expect(stripeInvoiceItem).toMatchObject({
			description: "Feature A, 15,000 units",
			amount: 14_000,
		});
		expect(stripeInvoiceItem?.quantity).toBeUndefined();
		expect(stripeInvoiceItem?.price_data).toBeUndefined();
	});

	test("renders source debits and offsets the funded credits", () => {
		const fixture = makeFixture({
			balance: 240,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 30_000, credits: 260 },
				[SOURCE_B_INTERNAL_ID]: { units: 5_000, credits: 500 },
			},
		});

		const result = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_123" } },
		});

		expect(
			result.invoiceCreditLineItems.map((lineItem) => ({
				amount: lineItem.amount,
				description: lineItem.description,
				featureId: lineItem.context.feature?.id,
				discountable: lineItem.context.discountable,
			})),
		).toEqual([
			{
				amount: 260,
				description: "Feature A, 30,000 units",
				featureId: "feature_a",
				discountable: false,
			},
			{
				amount: 500,
				description: "Feature B, 5,000 units",
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
			result.invoiceCreditLineItems.every(
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

		const result = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_overage" } },
		});

		expect(
			result.invoiceCreditLineItems.map((lineItem) => lineItem.amount),
		).toEqual([1_200, -1_000]);
	});

	test("renders attribution for a removed source feature without aborting renewal", () => {
		const fixture = makeFixture({
			balance: 990,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 50, credits: 10 },
			},
		});
		fixture.ctx.features = [];

		const result = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_removed" } },
		});

		expect(
			result.invoiceCreditLineItems.map((lineItem) => ({
				amount: lineItem.amount,
				description: lineItem.description,
				featureId: lineItem.context.feature?.id,
			})),
		).toEqual([
			{
				amount: 10,
				description: "Removed feature, 50 units",
				featureId: "invoice_credits",
			},
			{
				amount: -10,
				description: "Credits applied",
				featureId: "invoice_credits",
			},
		]);
	});

	test("balances fully funded fractional credits in Stripe minor units", () => {
		const fixture = makeFixture({
			balance: 999.988,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 1, credits: 0.006 },
				[SOURCE_B_INTERNAL_ID]: { units: 1, credits: 0.006 },
			},
		});

		const result = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_rounding" } },
		});
		const stripeInvoiceItems = lineItemsToCreateInvoiceItemsParams({
			stripeCustomerId: "stripe_customer",
			stripeInvoiceId: "stripe_invoice",
			lineItems: result.invoiceCreditLineItems,
		});

		expect(stripeInvoiceItems.map((invoiceItem) => invoiceItem.amount)).toEqual(
			[1, 1, -2],
		);
	});

	test("balances partially funded fractional credits in Stripe minor units", () => {
		const fixture = makeFixture({
			balance: -0.012,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 1, credits: 0.506 },
				[SOURCE_B_INTERNAL_ID]: { units: 1, credits: 0.506 },
			},
		});

		const result = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_partial" } },
		});
		const stripeInvoiceItems = lineItemsToCreateInvoiceItemsParams({
			stripeCustomerId: "stripe_customer",
			stripeInvoiceId: "stripe_invoice",
			lineItems: result.invoiceCreditLineItems,
		});

		expect(stripeInvoiceItems.map((invoiceItem) => invoiceItem.amount)).toEqual(
			[51, 51, -101],
		);
	});

	test("emits no lines for empty attribution but still prepares the reset", () => {
		const fixture = makeFixture({ balance: 1_000 });

		const result = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_empty" } },
		});

		expect(result.invoiceCreditLineItems).toEqual([]);
		expect(result.updateCustomerEntitlements).toHaveLength(1);
	});

	test("does not fall back to a normal usage charge when invoice credit rendering is omitted", () => {
		const fixture = makeFixture({
			balance: -10,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 5_050, credits: 1_010 },
			},
		});

		const result = customerProductToArrearLineItems(fixture);

		expect(result.lineItems).toEqual([]);
		expect(result.invoiceCreditLineItems).toEqual([]);
		expect(result.updateCustomerEntitlements).toHaveLength(1);
	});

	test("includes invoice-credit usage when a plan is replaced immediately", () => {
		const fixture = makeFixture({
			balance: 960,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 200, credits: 40 },
			},
		});

		const result = buildAutumnLineItems({
			ctx: fixture.ctx,
			newCustomerProducts: [],
			deletedCustomerProducts: [fixture.customerProduct],
			billingContext: fixture.billingContext,
			includeArrearLineItems: true,
		});

		expect(
			result.allLineItems
				.filter((lineItem) => lineItem.context.billingTiming === "in_arrear")
				.map((lineItem) => ({
					amount: lineItem.amount,
					description: lineItem.description,
				})),
		).toEqual([
			{ amount: 40, description: "Feature A, 200 units" },
			{ amount: -40, description: "Credits applied" },
		]);
	});

	test("fully offsets overage when overage billing is disabled", () => {
		const fixture = makeFixture({
			balance: -200,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 12_000, credits: 1_200 },
			},
		});

		const result = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { fullyOffsetOverage: true } },
		});

		expect(
			result.invoiceCreditLineItems.map((lineItem) => lineItem.amount),
		).toEqual([1_200, -1_200]);
	});

	test("uses stable line IDs for the same invoice", () => {
		const fixture = makeFixture({
			balance: 990,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 100, credits: 10 },
			},
		});

		const first = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_retry" } },
		});
		const second = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_retry" } },
		});

		expect(first.invoiceCreditLineItems).toHaveLength(2);
		expect(first.invoiceCreditLineItems.map((lineItem) => lineItem.id)).toEqual(
			second.invoiceCreditLineItems.map((lineItem) => lineItem.id),
		);
	});

	test("projects the same debit and offset lines into the next invoice preview", () => {
		const fixture = makeFixture({
			balance: 960,
			creditSchema: [
				{
					metered_feature_id: sourceA.id,
					feature_amount: 1,
					credit_amount: 0.2,
				},
			],
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
				description: "Feature A, 200 units",
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

	test("projects invoice-credit lines into the final cancellation preview", () => {
		const fixture = makeFixture({
			balance: 960,
			usageAttribution: {
				[SOURCE_A_INTERNAL_ID]: { units: 200, credits: 40 },
			},
		});
		const subscriptionId = "subscription_canceling";
		const stripeSubscription = {
			id: subscriptionId,
			items: {
				data: [{ current_period_end: PERIOD_END / 1_000 }],
			},
		} as never;

		const result = getFinalUsageInvoicePreview({
			ctx: fixture.ctx,
			billingContext: {
				...fixture.billingContext,
				stripeSubscription,
			},
			customerProducts: [fixture.customerProduct],
			subscriptionId,
		});

		expect(
			result?.line_items.map((lineItem) => ({
				featureId: lineItem.feature_id,
				description: lineItem.description,
				subtotal: lineItem.subtotal,
			})),
		).toEqual([
			{
				featureId: "feature_a",
				description: "Feature A, 200 units",
				subtotal: 40,
			},
			{
				featureId: "invoice_credits",
				description: "Credits applied",
				subtotal: -40,
			},
		]);
		expect(result?.total).toBe(0);
	});
});
