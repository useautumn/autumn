// Red: a direct one-off add-on leaves recurring overage untouched and grants the full purchased balance.
// Green: the purchase clears that overage first and grants only the remainder on the add-on.

import { expect, test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiCustomerV5,
	AttachParamsV1Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const INCLUDED_PER_BALANCE = 15_000_000;
const OVERAGE = 127_803;
const PURCHASED_CREDITS = 5_000_000;
const PENDING_CHECKOUT_OVERAGE = 100_000;

const buildScenarioProducts = () => {
	const recurringPlan = products.base({
		id: "recurring-plan",
		items: [
			items.annualPrice({ price: 200 }),
			items.monthlyMessages({ includedUsage: INCLUDED_PER_BALANCE }),
			items.lifetimeMessages({ includedUsage: INCLUDED_PER_BALANCE }),
		],
		billingControls: {
			overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
		},
	});
	const oneOffAddOn = products.oneOffAddOn({
		id: "credit-add-on",
		items: [
			items.oneOffMessages({
				billingUnits: PURCHASED_CREDITS,
				price: 10,
			}),
		],
	});

	return { recurringPlan, oneOffAddOn };
};

const findPlanBreakdown = ({
	customer,
	planId,
	interval,
}: {
	customer: ApiCustomerV5;
	planId: string;
	interval: "month" | "one_off";
}) => {
	const breakdown = customer.balances[TestFeature.Messages].breakdown?.find(
		(item) => item.plan_id === planId && item.reset?.interval === interval,
	);

	expect(breakdown).toBeDefined();
	return breakdown!;
};

test.concurrent(
	`${chalk.yellowBright("one-off add-on overage paydown: purchase clears recurring overage before granting remainder")}`,
	async () => {
		const { recurringPlan, oneOffAddOn } = buildScenarioProducts();

		const { customerId, autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId: "one-off-overage-paydown",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringPlan, oneOffAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: recurringPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: INCLUDED_PER_BALANCE * 2 + OVERAGE,
					timeout: 2000,
				}),
			],
		});

		const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const recurringBefore = findPlanBreakdown({
			customer: before,
			planId: recurringPlan.id,
			interval: "month",
		});
		const lifetimeBefore = findPlanBreakdown({
			customer: before,
			planId: recurringPlan.id,
			interval: "one_off",
		});
		expect(recurringBefore).toMatchObject({
			remaining: 0,
			usage: INCLUDED_PER_BALANCE + OVERAGE,
		});
		expect(lifetimeBefore).toMatchObject({
			remaining: 0,
			usage: INCLUDED_PER_BALANCE,
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOffAddOn.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PURCHASED_CREDITS },
			],
			redirect_mode: "if_required",
		});

		const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const recurringAfter = findPlanBreakdown({
			customer: after,
			planId: recurringPlan.id,
			interval: "month",
		});
		const addOnAfter = findPlanBreakdown({
			customer: after,
			planId: oneOffAddOn.id,
			interval: "one_off",
		});

		expect(recurringAfter).toMatchObject({
			remaining: 0,
			usage: INCLUDED_PER_BALANCE,
		});
		expect(addOnAfter).toMatchObject({
			prepaid_grant: PURCHASED_CREDITS,
			remaining: PURCHASED_CREDITS - OVERAGE,
			usage: OVERAGE,
		});
		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Messages,
			granted: INCLUDED_PER_BALANCE * 2 + PURCHASED_CREDITS,
			remaining: PURCHASED_CREDITS - OVERAGE,
			usage: INCLUDED_PER_BALANCE * 2 + OVERAGE,
		});

		const invoiceCustomer =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer: invoiceCustomer,
			count: 2,
			latestTotal: 20,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off add-on overage paydown: included and prepaid credits both pay overage")}`,
	async () => {
		const includedCredits = 1_000;
		const totalCredits = 2_000;
		const existingOverage = 1_500;
		const recurringPlan = products.base({
			id: "combined-balance-recurring",
			items: [
				items.annualPrice({ price: 200 }),
				items.monthlyMessages({ includedUsage: includedCredits }),
			],
			billingControls: {
				overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
			},
		});
		const oneOffAddOn = products.oneOffAddOn({
			id: "combined-balance-add-on",
			items: [
				items.oneOffMessages({
					includedUsage: includedCredits,
					billingUnits: includedCredits,
					price: 10,
				}),
			],
		});

		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "one-off-included-and-prepaid-paydown",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringPlan, oneOffAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: recurringPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: includedCredits + existingOverage,
					timeout: 2000,
				}),
			],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOffAddOn.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: totalCredits },
			],
			redirect_mode: "if_required",
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const recurring = findPlanBreakdown({
			customer,
			planId: recurringPlan.id,
			interval: "month",
		});
		const addOn = findPlanBreakdown({
			customer,
			planId: oneOffAddOn.id,
			interval: "one_off",
		});

		expect(recurring).toMatchObject({
			remaining: 0,
			usage: includedCredits,
		});
		expect(addOn).toMatchObject({
			included_grant: includedCredits,
			prepaid_grant: includedCredits,
			remaining: totalCredits - existingOverage,
			usage: existingOverage,
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: includedCredits + totalCredits,
			remaining: totalCredits - existingOverage,
			usage: includedCredits + existingOverage,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off add-on overage paydown: persisted overage remains separate")}`,
	async () => {
		const { recurringPlan, oneOffAddOn } = buildScenarioProducts();
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "one-off-persisted-overage",
			setup: [
				s.platform.create({
					userEmail: `one-off-overage-${Math.random().toString(36).slice(2)}@autumn.test`,
					configOverrides: { persist_free_overage: true },
					setupDefaultFeatures: true,
				}),
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringPlan, oneOffAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: recurringPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: INCLUDED_PER_BALANCE * 2 + OVERAGE,
					timeout: 2000,
				}),
			],
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOffAddOn.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PURCHASED_CREDITS },
			],
			redirect_mode: "if_required",
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const recurring = findPlanBreakdown({
			customer,
			planId: recurringPlan.id,
			interval: "month",
		});
		const addOn = findPlanBreakdown({
			customer,
			planId: oneOffAddOn.id,
			interval: "one_off",
		});

		expect(recurring).toMatchObject({
			remaining: 0,
			usage: INCLUDED_PER_BALANCE + OVERAGE,
		});
		expect(addOn).toMatchObject({
			prepaid_grant: PURCHASED_CREDITS,
			remaining: PURCHASED_CREDITS,
			usage: 0,
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: INCLUDED_PER_BALANCE * 2 + PURCHASED_CREDITS,
			remaining: PURCHASED_CREDITS,
			usage: INCLUDED_PER_BALANCE * 2 + OVERAGE,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off add-on overage paydown: immediate-access checkout applies paydown once")}`,
	async () => {
		const { recurringPlan, oneOffAddOn } = buildScenarioProducts();
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "one-off-overage-immediate-checkout",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringPlan, oneOffAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: recurringPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: INCLUDED_PER_BALANCE * 2 + OVERAGE,
					timeout: 2000,
				}),
				s.removePaymentMethod(),
			],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOffAddOn.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PURCHASED_CREDITS },
			],
			enable_plan_immediately: true,
			redirect_mode: "if_required",
		});
		expect(result.payment_url).toContain("checkout.stripe.com");

		await completeStripeCheckoutFormV2({ url: result.payment_url! });

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const recurring = findPlanBreakdown({
			customer,
			planId: recurringPlan.id,
			interval: "month",
		});
		const addOn = findPlanBreakdown({
			customer,
			planId: oneOffAddOn.id,
			interval: "one_off",
		});

		expect(recurring).toMatchObject({
			remaining: 0,
			usage: INCLUDED_PER_BALANCE,
		});
		expect(addOn).toMatchObject({
			prepaid_grant: PURCHASED_CREDITS,
			remaining: PURCHASED_CREDITS - OVERAGE,
			usage: OVERAGE,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off add-on overage paydown: deferred checkout uses completion-time overage")}`,
	async () => {
		const { recurringPlan, oneOffAddOn } = buildScenarioProducts();
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "one-off-overage-deferred-checkout",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringPlan, oneOffAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: recurringPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: INCLUDED_PER_BALANCE * 2 + OVERAGE,
					timeout: 2000,
				}),
				s.removePaymentMethod(),
			],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOffAddOn.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PURCHASED_CREDITS },
			],
			redirect_mode: "if_required",
		});
		expect(result.payment_url).toContain("checkout.stripe.com");

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PENDING_CHECKOUT_OVERAGE,
		});
		await completeStripeCheckoutFormV2({ url: result.payment_url! });

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const recurring = findPlanBreakdown({
			customer,
			planId: recurringPlan.id,
			interval: "month",
		});
		const addOn = findPlanBreakdown({
			customer,
			planId: oneOffAddOn.id,
			interval: "one_off",
		});
		const totalOverage = OVERAGE + PENDING_CHECKOUT_OVERAGE;

		expect(recurring).toMatchObject({
			remaining: 0,
			usage: INCLUDED_PER_BALANCE,
		});
		expect(addOn).toMatchObject({
			prepaid_grant: PURCHASED_CREDITS,
			remaining: PURCHASED_CREDITS - totalOverage,
			usage: totalOverage,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
