/** set_plans and overage accrued on a plan it changes, mirroring Stripe flexible billing.
 * Pro: $20/mo, 100 messages included, $0.10 over; 150 tracked = $5. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingInterval,
	ms,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const OVERAGE_TOTAL = 5;

const setupProInOverage = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.consumableMessages({ includedUsage: 500 })],
	});
	const addOn = products.base({
		id: "addon",
		isAddOn: true,
		items: [items.monthlyPrice({ price: 10 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, addOn] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: addOn.id }),
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 2000 }),
		],
	});

	return { ...scenario, pro, premium, addOn };
};

const invoicedMessagesAmounts = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const { data } = await ctx.stripeCli.invoices.list({
		customer: fullCustomer.processor!.id,
		limit: 100,
	});
	return data.flatMap((invoice) =>
		invoice.lines.data
			.filter((line) => /messages/i.test(line.description ?? ""))
			.map((line) => line.amount / 100),
	);
};

const previewMessagesAmounts = (preview: SetPlansPreviewResponse) =>
	preview.line_items
		.filter((lineItem) => lineItem.feature_id === TestFeature.Messages)
		.map((lineItem) => lineItem.total);

const previewWarnsUsageNotBilled = (preview: SetPlansPreviewResponse) =>
	preview.warnings.some((warning) => warning.type === "usage_not_billed");

const previewAndSetPlans = async ({
	scenario,
	params,
}: {
	scenario: Awaited<ReturnType<typeof setupProInOverage>>;
	params: SetPlansParamsV0Input;
}) => {
	const { autumnV2_2, ctx, customerId } = scenario;
	const preview = await autumnV2_2.billing.previewSetPlans(params);
	await autumnV2_2.billing.setPlans(params);
	return {
		preview: {
			messagesAmounts: previewMessagesAmounts(preview),
			warnsUsageNotBilled: previewWarnsUsageNotBilled(preview),
		},
		invoicedMessagesAmounts: await invoicedMessagesAmounts({
			ctx,
			customerId: customerId!,
		}),
	};
};

const expectMessagesUsage = async ({
	scenario,
	includedUsage,
	usage,
}: {
	scenario: Awaited<ReturnType<typeof setupProInOverage>>;
	includedUsage: number;
	usage: number;
}) => {
	const customer = await scenario.autumnV1.customers.get<ApiCustomerV3>(
		scenario.customerId!,
	);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage,
		balance: includedUsage - usage,
		usage,
	});
};

// Stripe: a swapped metered price bills pre-swap usage at the old price, invoiced now
// under always_invoice; the new price starts from zero usage.
test.concurrent(
	`${chalk.yellowBright("set-plans overage 1: switching plans bills the overage now at the old price, and the new plan starts at zero usage")}`,
	async () => {
		const scenario = await setupProInOverage({
			customerId: "set-plans-overage-switch",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: {
				customer_id: scenario.customerId!,
				phases: [
					{
						starts_at: "now",
						plans: [
							{ plan_id: scenario.premium.id },
							{ plan_id: scenario.addOn.id },
						],
					},
				],
			},
		});

		expect(result).toEqual({
			preview: { messagesAmounts: [OVERAGE_TOTAL], warnsUsageNotBilled: false },
			invoicedMessagesAmounts: [OVERAGE_TOTAL],
		});
		await expectMessagesUsage({ scenario, includedUsage: 500, usage: 0 });
	},
);

// Stripe: proration_behavior none drops the pre-swap usage entirely.
test.concurrent(
	`${chalk.yellowBright("set-plans overage 2: switching plans with proration none never bills the overage")}`,
	async () => {
		const scenario = await setupProInOverage({
			customerId: "set-plans-overage-switch-none",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: {
				customer_id: scenario.customerId!,
				phases: [
					{
						starts_at: "now",
						proration_behavior: "none",
						plans: [
							{ plan_id: scenario.premium.id },
							{ plan_id: scenario.addOn.id },
						],
					},
				],
			},
		});

		expect(result).toEqual({
			preview: { messagesAmounts: [], warnsUsageNotBilled: false },
			invoicedMessagesAmounts: [],
		});
		await expectMessagesUsage({ scenario, includedUsage: 500, usage: 0 });
	},
);

// Stripe: removing a metered item bills its usage, invoiced now under always_invoice.
test.concurrent(
	`${chalk.yellowBright("set-plans overage 3: a plan the request drops bills its overage now")}`,
	async () => {
		const scenario = await setupProInOverage({
			customerId: "set-plans-overage-dropped",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: {
				customer_id: scenario.customerId!,
				phases: [{ starts_at: "now", plans: [{ plan_id: scenario.addOn.id }] }],
			},
		});

		expect(result).toEqual({
			preview: { messagesAmounts: [OVERAGE_TOTAL], warnsUsageNotBilled: false },
			invoicedMessagesAmounts: [OVERAGE_TOTAL],
		});
	},
);

// The replaced plan's usage is billed at the switch and reset, unless carry_over_usages asks to carry it.
test.concurrent(
	`${chalk.yellowBright("set-plans overage 4: re-configuring a plan bills its overage now and resets usage")}`,
	async () => {
		const scenario = await setupProInOverage({
			customerId: "set-plans-overage-reconfig",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: {
				customer_id: scenario.customerId!,
				phases: [
					{
						starts_at: "now",
						plans: [
							{
								plan_id: scenario.pro.id,
								customize: {
									price: { amount: 30, interval: BillingInterval.Month },
								},
							},
							{ plan_id: scenario.addOn.id },
						],
					},
				],
			},
		});

		expect(result).toEqual({
			preview: { messagesAmounts: [OVERAGE_TOTAL], warnsUsageNotBilled: false },
			invoicedMessagesAmounts: [OVERAGE_TOTAL],
		});
		await expectMessagesUsage({ scenario, includedUsage: 100, usage: 0 });
	},
);

// carry_over_usages moves the usage onto the replacing plan, so nothing is billed now.
test.concurrent(
	`${chalk.yellowBright("set-plans overage 4b: re-configuring a plan with carry_over_usages carries the overage instead of billing it")}`,
	async () => {
		const scenario = await setupProInOverage({
			customerId: "set-plans-overage-reconfig-carry",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: {
				customer_id: scenario.customerId!,
				carry_over_usages: { enabled: true },
				phases: [
					{
						starts_at: "now",
						plans: [
							{
								plan_id: scenario.pro.id,
								customize: {
									price: { amount: 30, interval: BillingInterval.Month },
								},
							},
							{ plan_id: scenario.addOn.id },
						],
					},
				],
			},
		});

		expect(result).toEqual({
			preview: { messagesAmounts: [], warnsUsageNotBilled: false },
			invoicedMessagesAmounts: [],
		});
		await expectMessagesUsage({ scenario, includedUsage: 100, usage: 150 });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans overage 5: re-listing the current plan keeps its overage for renewal")}`,
	async () => {
		const scenario = await setupProInOverage({
			customerId: "set-plans-overage-relist",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: {
				customer_id: scenario.customerId!,
				phases: [
					{
						starts_at: "now",
						plans: [
							{ plan_id: scenario.pro.id },
							{ plan_id: scenario.addOn.id },
						],
					},
				],
			},
		});

		expect(result).toEqual({
			preview: { messagesAmounts: [], warnsUsageNotBilled: false },
			invoicedMessagesAmounts: [],
		});
		await expectMessagesUsage({ scenario, includedUsage: 100, usage: 150 });
	},
);

// Stripe: ending a subscription now with a credit (prorate + invoice_now) also invoices its usage,
// so the preview must show the charge execute makes rather than warn it goes unbilled.
test.concurrent(
	`${chalk.yellowBright("set-plans overage 6: a later first phase that replaces the live subscription bills the overage now, and the preview says so")}`,
	async () => {
		const scenario = await setupProInOverage({
			customerId: "set-plans-overage-future-start",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: {
				customer_id: scenario.customerId!,
				phases: [
					{
						starts_at: scenario.advancedTo + ms.days(7),
						plans: [{ plan_id: scenario.premium.id }],
					},
				],
			},
		});

		expect(result).toEqual({
			preview: { messagesAmounts: [OVERAGE_TOTAL], warnsUsageNotBilled: false },
			invoicedMessagesAmounts: [OVERAGE_TOTAL],
		});
	},
);
