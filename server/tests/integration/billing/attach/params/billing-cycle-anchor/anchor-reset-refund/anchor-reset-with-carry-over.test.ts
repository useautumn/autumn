import { expect, test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { EntInterval, ProductItemInterval } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { calculateAnchorResetNoPartialRefundTotal } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

const expectTotalEqual = ({
	actual,
	expected,
	tolerance = 0.01,
}: {
	actual: number;
	expected: number;
	tolerance?: number;
}) => {
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

/**
 * Anchor Reset Refund -- With Carry Over Balances
 *
 * When `billing_cycle_anchor: "now"` + `proration_behavior: "none"` WITH carry_over_balances:
 * Refund only complete entitlement-reset periods of the outgoing plan.
 * The rounding granularity is the longest entitlement reset interval among carried features.
 */

test.concurrent(`${chalk.yellowBright("anchor-reset-carry-over 1: annual -> monthly (full period refund)")}`, async () => {
	const customerId = "anchor-no-partial-a2m";
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, premium] }),
		],
		actions: [
			s.billing.attach({ productId: proAnnual.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const { total: expectedTotal } =
		await calculateAnchorResetNoPartialRefundTotal({
			customerId,
			advancedTo,
			oldAmount: 200,
			newAmount: 50,
			refundCycleInterval: EntInterval.Month,
			interval: "year",
		});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
		plan_schedule: "immediate",
	});

	expectTotalEqual({ actual: preview.total, expected: expectedTotal });

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
		redirect_mode: "if_required",
		plan_schedule: "immediate",
	});

	expect(result.invoice).toBeDefined();
	expectTotalEqual({
		actual: result.invoice?.total ?? 0,
		expected: expectedTotal,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [proAnnual.id],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("anchor-reset-carry-over 2: annual -> annual (full period refund)")}`, async () => {
	const customerId = "anchor-no-partial-a2a";
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premiumAnnual = products.base({
		id: "premium-annual",
		items: [
			items.monthlyMessages({ includedUsage: 500 }),
			items.annualPrice({ price: 500 }),
		],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, premiumAnnual] }),
		],
		actions: [
			s.billing.attach({ productId: proAnnual.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const { total: expectedTotal } =
		await calculateAnchorResetNoPartialRefundTotal({
			customerId,
			advancedTo,
			oldAmount: 200,
			newAmount: 500,
			refundCycleInterval: EntInterval.Month,
			interval: "year",
		});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premiumAnnual.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
	});

	expectTotalEqual({ actual: preview.total, expected: expectedTotal });

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premiumAnnual.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expectTotalEqual({
		actual: result.invoice?.total ?? 0,
		expected: expectedTotal,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premiumAnnual.id],
		notPresent: [proAnnual.id],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("anchor-reset-carry-over 3: monthly + hourly messages (longest interval = monthly)")}`, async () => {
	const customerId = "anchor-no-partial-hourly";
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.hourlyMessages({ includedUsage: 50 }),
		],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, premium] }),
		],
		actions: [
			s.billing.attach({ productId: proAnnual.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const { total: expectedTotal } =
		await calculateAnchorResetNoPartialRefundTotal({
			customerId,
			advancedTo,
			oldAmount: 200,
			newAmount: 50,
			refundCycleInterval: EntInterval.Month,
			interval: "year",
		});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
	});

	expectTotalEqual({ actual: preview.total, expected: expectedTotal });

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expectTotalEqual({
		actual: result.invoice?.total ?? 0,
		expected: expectedTotal,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [proAnnual.id],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("anchor-reset-carry-over 4: monthly messages + one-off prepaid (longest interval = monthly)")}`, async () => {
	const customerId = "anchor-no-partial-oneoff";
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV2_2, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, premium] }),
		],
		actions: [
			s.billing.attach({ productId: proAnnual.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const { total: expectedTotal } =
		await calculateAnchorResetNoPartialRefundTotal({
			customerId,
			advancedTo,
			oldAmount: 200,
			newAmount: 50,
			refundCycleInterval: EntInterval.Month,
			interval: "year",
		});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
	});

	expectTotalEqual({ actual: preview.total, expected: expectedTotal });

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expectTotalEqual({
		actual: result.invoice?.total ?? 0,
		expected: expectedTotal,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [proAnnual.id],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("anchor-reset-carry-over 5: annual messages only (no refund - 0 full years remaining)")}`, async () => {
	const customerId = "anchor-no-partial-a2a-yearly-ent";
	const annualMessages = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Year,
	});
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [annualMessages],
	});
	const premiumAnnual = products.base({
		id: "premium-annual",
		items: [
			constructFeatureItem({
				featureId: TestFeature.Messages,
				includedUsage: 500,
				interval: ProductItemInterval.Year,
			}),
			items.annualPrice({ price: 500 }),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual, premiumAnnual] }),
		],
		actions: [
			s.billing.attach({ productId: proAnnual.id }),
			s.advanceTestClock({ months: 2, days: 15 }),
		],
	});

	const preview = await autumnV2_2.billing.previewAttach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premiumAnnual.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
	});

	expect(preview.total).toBe(500);

	const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premiumAnnual.id,
		billing_cycle_anchor: "now",
		proration_behavior: "none",
		carry_over_balances: { enabled: true },
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBe(500);

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premiumAnnual.id],
		notPresent: [proAnnual.id],
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
