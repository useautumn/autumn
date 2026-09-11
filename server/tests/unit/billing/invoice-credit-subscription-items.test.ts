// Red: paid invoice-credit plans include an empty credit subscription row.
// Green: the paid base drives renewals; source charges and credit resets remain intact.
import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	FeatureType,
	type FixedPriceConfig,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { features } from "@tests/utils/fixtures/db/features.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { stripeSubscriptions } from "@tests/utils/fixtures/stripe/subscriptions.js";
import { buildStripeSubscriptionItemsUpdate } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate.js";
import { customerProductToStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/subscriptionItems/customerProductToStripeItemSpecs.js";
import { customerProductToArrearLineItems } from "@/internal/billing/v2/utils/lineItems/customerProductToArrearLineItems.js";

const makeFixture = ({
	invoiceCredit = true,
	baseInterval = BillingInterval.Month,
	baseIntervalCount = 1,
	baseAmount = 5_000,
	includeBase = true,
}: {
	invoiceCredit?: boolean;
	baseInterval?: BillingInterval;
	baseIntervalCount?: number;
	baseAmount?: number;
	includeBase?: boolean;
} = {}) => {
	const source = features.create({ id: "voice", name: "Voice Minute" });
	const customerEntitlement = customerEntitlements.create({
		id: "customer_entitlement_credits",
		featureId: "credits",
		featureName: "Credits - Tier A",
		featureType: FeatureType.CreditSystem,
		featureConfig: { invoice_credit: invoiceCredit, schema: [] },
		allowance: 5_000,
		balance: -10_000,
	});
	customerEntitlement.usage_attribution = {
		[source.internal_id]: { units: 100_000, credits: 15_000 },
	};
	const creditPrice = prices.createConsumable({
		id: "credit_price",
		featureId: "credits",
		entitlementId: customerEntitlement.entitlement.id,
	});
	const basePrice = prices.createFixed({ id: "base_price" });
	basePrice.config = {
		...basePrice.config,
		amount: baseAmount,
		interval: baseInterval,
		interval_count: baseIntervalCount,
	} as FixedPriceConfig;
	const productPrices = includeBase ? [creditPrice, basePrice] : [creditPrice];
	const customerProduct = customerProducts.create({
		product: products.createFull({
			id: "enterprise",
			name: "Enterprise - Tier A",
			prices: productPrices,
			entitlements: [customerEntitlement.entitlement],
		}),
		customerPrices: productPrices.map((price) =>
			prices.createCustomer({ price }),
		),
		customerEntitlements: [customerEntitlement],
	});
	const ctx = contexts.create({
		features: [source, customerEntitlement.entitlement.feature],
	});
	const billingContext = contexts.createBilling({
		customerProducts: [customerProduct],
	});
	return { ctx, billingContext, customerProduct };
};

describe("invoice-credit subscription items", () => {
	test("omits the credit pool row when the paid base supplies its renewal interval", () => {
		const fixture = makeFixture();
		const { recurringItems } = customerProductToStripeItemSpecs(fixture);
		expect(recurringItems.map((item) => item.stripePriceId)).toEqual([
			"stripe_price_base_price",
		]);

		const settlement = customerProductToArrearLineItems({
			...fixture,
			options: { invoiceCredits: { idempotencyScope: "invoice_test" } },
		});
		expect(
			settlement.invoiceCreditLineItems.map((item) => ({
				amount: item.amount,
				description: item.description,
			})),
		).toEqual([
			{ amount: 15_000, description: "Voice Minute, 100,000 units" },
			{ amount: -5_000, description: "Credits applied" },
		]);
		expect(settlement.updateCustomerEntitlements[0]?.updates).toMatchObject({
			balance: 5_000,
			usage_attribution: {},
		});
	});

	test("keeps the metered item for classic credit systems", () => {
		const { recurringItems } = customerProductToStripeItemSpecs(
			makeFixture({ invoiceCredit: false }),
		);
		expect(recurringItems.map((item) => item.stripePriceId)).toEqual([
			"stripe_price_credit_price",
			"stripe_price_base_price",
		]);
	});

	test("removes the redundant item when an existing subscription is updated", () => {
		const fixture = makeFixture();
		const stripeSubscription = stripeSubscriptions.create({
			id: "sub_credits",
			items: [
				{ id: "si_base", priceId: "stripe_price_base_price", quantity: 1 },
				{ id: "si_credits", priceId: "stripe_price_credit_price", quantity: 0 },
			],
		});
		fixture.customerProduct.subscription_ids = [stripeSubscription.id];
		fixture.billingContext.stripeSubscription = stripeSubscription;
		expect(
			buildStripeSubscriptionItemsUpdate({
				ctx: fixture.ctx,
				billingContext: fixture.billingContext,
				autumnBillingPlan: { customerId: "test", insertCustomerProducts: [] },
				finalCustomerProducts: [fixture.customerProduct],
			}),
		).toEqual([{ id: "si_credits", deleted: true }]);
	});

	test.each([
		{ includeBase: false },
		{ baseAmount: 0 },
		{ baseInterval: BillingInterval.OneOff },
		{ baseInterval: BillingInterval.Year },
		{ baseIntervalCount: 2 },
	])(
		"keeps the credit item when the base cannot supply monthly renewals: %j",
		(options) => {
			const { recurringItems } = customerProductToStripeItemSpecs(
				makeFixture(options),
			);
			expect(recurringItems.map((item) => item.stripePriceId)).toContain(
				"stripe_price_credit_price",
			);
		},
	);
});
