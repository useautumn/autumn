/** Re-listing a paid plan no Stripe subscription bills starts billing it: the accrued overage is
 * invoiced now at the price it was used at, a subscription starts and usage resets, the same as a price change. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingInterval,
	BillingMethod,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

type Phase = SetPlansParamsV0Input["phases"][number];
type PhaseBilling = Pick<Phase, "proration_behavior" | "billing_cycle_anchor">;
type PlanCustomize = Phase["plans"][number]["customize"];

const BASE_PRICE = 20;
const CHANGED_BASE_PRICE = 30;
const OVERAGE_TOTAL = 5;

const usagePriceChange: PlanCustomize = {
	items: [
		{
			feature_id: TestFeature.Messages,
			included: 100,
			price: {
				amount: 0.15,
				interval: BillingInterval.Month,
				billing_method: BillingMethod.UsageBased,
				billing_units: 1,
			},
		},
	],
};

const basePriceChange: PlanCustomize = {
	price: { amount: CHANGED_BASE_PRICE, interval: BillingInterval.Month },
};

/** Pro ($20/mo, 100 messages, $0.10 over) attached without billing, then 150 messages tracked. */
const setupUnbilledProInOverage = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
	await scenario.autumnV2_2.billing.attach({
		customer_id: customerId,
		plan_id: pro.id,
		no_billing_changes: true,
		redirect_mode: "never",
	});
	await scenario.autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});
	await timeout(2000);
	return { ...scenario, pro };
};

const isMessagesLine = (description: string | null | undefined) =>
	/messages/i.test(description ?? "");

const previewAmounts = (preview: SetPlansPreviewResponse) => ({
	total: preview.total,
	messages: preview.line_items
		.filter((lineItem) => lineItem.feature_id === TestFeature.Messages)
		.map((lineItem) => lineItem.total),
});

const invoicedAmounts = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof setupUnbilledProInOverage>>;
}) => {
	const { ctx, customerId } = scenario;
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId!,
	});
	const { data } = await ctx.stripeCli.invoices.list({
		customer: fullCustomer.processor!.id,
		limit: 100,
	});
	const lines = data.flatMap((invoice) => invoice.lines.data);
	return {
		messages: lines
			.filter((line) => isMessagesLine(line.description))
			.map((line) => line.amount / 100),
		other: lines
			.filter((line) => !isMessagesLine(line.description))
			.map((line) => line.amount / 100),
	};
};

const subscriptionCount = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof setupUnbilledProInOverage>>;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx: scenario.ctx,
		idOrInternalId: scenario.customerId!,
	});
	const { data } = await scenario.ctx.stripeCli.subscriptions.list({
		customer: fullCustomer.processor!.id,
		status: "all",
	});
	return data.length;
};

const messagesUsage = async ({
	scenario,
}: {
	scenario: Awaited<ReturnType<typeof setupUnbilledProInOverage>>;
}) => {
	const customer = await scenario.autumnV1.customers.get<ApiCustomerV3>(
		scenario.customerId!,
	);
	return customer.features[TestFeature.Messages]?.usage;
};

const relistPro = async ({
	customerId,
	customize,
	phaseBilling,
}: {
	customerId: string;
	customize?: PlanCustomize;
	phaseBilling: PhaseBilling;
}) => {
	const scenario = await setupUnbilledProInOverage({ customerId });
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		redirect_mode: "never",
		phases: [
			{
				starts_at: "now",
				...phaseBilling,
				plans: [
					{
						plan_id: scenario.pro.id,
						...(customize && { customize }),
					},
				],
			},
		],
	};

	const preview = await scenario.autumnV2_2.billing.previewSetPlans(params);
	await scenario.autumnV2_2.billing.setPlans(params);

	return {
		preview: previewAmounts(preview),
		invoiced: await invoicedAmounts({ scenario }),
		subscriptions: await subscriptionCount({ scenario }),
		usage: await messagesUsage({ scenario }),
	};
};

/** Billing starts now: the overage at the price it was used at, a full period of the base price. */
const startsBilling = ({ basePrice }: { basePrice: number }) => ({
	preview: { total: basePrice + OVERAGE_TOTAL, messages: [OVERAGE_TOTAL] },
	invoiced: { messages: [OVERAGE_TOTAL], other: [basePrice] },
	subscriptions: 1,
	usage: 0,
});

const behaviors: {
	name: string;
	suffix: string;
	phaseBilling: PhaseBilling;
}[] = [
	{ name: "default proration", suffix: "default", phaseBilling: {} },
	{
		name: "proration none",
		suffix: "none",
		phaseBilling: { proration_behavior: "none" },
	},
	{
		name: "bill_difference",
		suffix: "bill-diff",
		phaseBilling: { proration_behavior: "bill_difference" },
	},
	{
		name: "reset now",
		suffix: "reset",
		phaseBilling: { billing_cycle_anchor: "phase_start" },
	},
];

for (const { name, suffix, phaseBilling } of behaviors) {
	test.concurrent(
		`${chalk.yellowBright(`set-plans re-list unbilled (${name}): an unchanged re-list starts billing exactly like a price change`)}`,
		async () => {
			const [unchanged, usagePriceChanged, basePriceChanged] =
				await Promise.all([
					relistPro({
						customerId: `set-plans-relist-unbilled-same-${suffix}`,
						phaseBilling,
					}),
					relistPro({
						customerId: `set-plans-relist-unbilled-usage-${suffix}`,
						customize: usagePriceChange,
						phaseBilling,
					}),
					relistPro({
						customerId: `set-plans-relist-unbilled-base-${suffix}`,
						customize: basePriceChange,
						phaseBilling,
					}),
				]);

			expect({ unchanged, usagePriceChanged, basePriceChanged }).toEqual({
				unchanged: startsBilling({ basePrice: BASE_PRICE }),
				usagePriceChanged: startsBilling({ basePrice: BASE_PRICE }),
				basePriceChanged: startsBilling({ basePrice: CHANGED_BASE_PRICE }),
			});
		},
	);
}
