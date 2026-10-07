/** set_plans carry_over_usages, mirroring attach: carried usage moves onto the replacing plan unbilled.
 * Pro: 100 messages included, $0.10 over; words $0.05 each. 150 messages + 100 words tracked = $5 + $5. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	ErrCode,
	ms,
	type SetPlansParamsV0Input,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const setupProWithUsage = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		id: "pro",
		items: [
			items.consumableMessages({ includedUsage: 100 }),
			items.consumableWords(),
		],
	});
	const premium = products.premium({
		id: "premium",
		items: [
			items.consumableMessages({ includedUsage: 500 }),
			items.consumableWords(),
		],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 150 }),
			s.track({ featureId: TestFeature.Words, value: 100, timeout: 2000 }),
		],
	});

	return { ...scenario, pro, premium };
};

type Scenario = Awaited<ReturnType<typeof setupProWithUsage>>;

const previewUsageTotals = (preview: SetPlansPreviewResponse) =>
	Object.fromEntries(
		preview.line_items
			.filter((lineItem) => lineItem.feature_id)
			.map((lineItem) => [lineItem.feature_id, lineItem.total]),
	);

const invoicedUsageTotals = async ({ scenario }: { scenario: Scenario }) => {
	const fullCustomer = await CusService.getFull({
		ctx: scenario.ctx,
		idOrInternalId: scenario.customerId!,
	});
	const { data } = await scenario.ctx.stripeCli.invoices.list({
		customer: fullCustomer.processor!.id,
		limit: 100,
	});
	const totals: Record<string, number> = {};
	for (const line of data.flatMap((invoice) => invoice.lines.data)) {
		const featureId = [TestFeature.Messages, TestFeature.Words].find((id) =>
			line.description?.toLowerCase().includes(id),
		);
		if (featureId) totals[featureId] = line.amount / 100;
	}
	return totals;
};

const previewAndSetPlans = async ({
	scenario,
	params,
}: {
	scenario: Scenario;
	params: SetPlansParamsV0Input;
}) => {
	const preview = await scenario.autumnV2_2.billing.previewSetPlans(params);
	await scenario.autumnV2_2.billing.setPlans(params);
	await new Promise((resolve) => setTimeout(resolve, 2000));
	return {
		previewed: previewUsageTotals(preview),
		invoiced: await invoicedUsageTotals({ scenario }),
	};
};

const expectUsage = async ({
	scenario,
	messages,
	words,
}: {
	scenario: Scenario;
	messages: number;
	words: number;
}) => {
	const customer = await scenario.autumnV1.customers.get<ApiCustomerV3>(
		scenario.customerId!,
	);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		usage: messages,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		usage: words,
	});
};

const switchToPremium = ({
	scenario,
	carryOverUsages,
	resetsCycle = false,
}: {
	scenario: Scenario;
	carryOverUsages?: SetPlansParamsV0Input["carry_over_usages"];
	resetsCycle?: boolean;
}): SetPlansParamsV0Input => ({
	customer_id: scenario.customerId!,
	carry_over_usages: carryOverUsages,
	phases: [
		{
			starts_at: "now",
			plans: [{ plan_id: scenario.premium.id }],
			...(resetsCycle && { billing_cycle_anchor: "phase_start" as const }),
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("set-plans carry-over-usages 1: without carry_over_usages the replaced plan's usage is billed and reset")}`,
	async () => {
		const scenario = await setupProWithUsage({
			customerId: "set-plans-carry-none",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: switchToPremium({ scenario }),
		});

		expect(result).toEqual({
			previewed: { [TestFeature.Messages]: 5, [TestFeature.Words]: 5 },
			invoiced: { [TestFeature.Messages]: 5, [TestFeature.Words]: 5 },
		});
		await expectUsage({ scenario, messages: 0, words: 0 });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans carry-over-usages 2: enabled carries every consumable's usage unbilled")}`,
	async () => {
		const scenario = await setupProWithUsage({
			customerId: "set-plans-carry-all",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: switchToPremium({
				scenario,
				carryOverUsages: { enabled: true },
			}),
		});

		expect(result).toEqual({ previewed: {}, invoiced: {} });
		await expectUsage({ scenario, messages: 150, words: 100 });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans carry-over-usages 3: features left out of feature_ids are billed and reset")}`,
	async () => {
		const scenario = await setupProWithUsage({
			customerId: "set-plans-carry-feature-ids",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: switchToPremium({
				scenario,
				carryOverUsages: {
					enabled: true,
					feature_ids: [TestFeature.Messages],
				},
			}),
		});

		expect(result).toEqual({
			previewed: { [TestFeature.Words]: 5 },
			invoiced: { [TestFeature.Words]: 5 },
		});
		await expectUsage({ scenario, messages: 150, words: 0 });
	},
);

// Opt-in exception to billing usage at a reset: carried usage moves onto the new cycle, as on attach.
test.concurrent(
	`${chalk.yellowBright("set-plans carry-over-usages 4: a cycle reset now still carries the requested usage")}`,
	async () => {
		const scenario = await setupProWithUsage({
			customerId: "set-plans-carry-reset-now",
		});

		const result = await previewAndSetPlans({
			scenario,
			params: switchToPremium({
				scenario,
				carryOverUsages: { enabled: true },
				resetsCycle: true,
			}),
		});

		expect(result).toEqual({ previewed: {}, invoiced: {} });
		await expectUsage({ scenario, messages: 150, words: 100 });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans carry-over-usages 5: rejected when no plan is replaced now")}`,
	async () => {
		const scenario = await setupProWithUsage({
			customerId: "set-plans-carry-errors",
		});
		const { autumnV2_2, customerId, pro, premium, advancedTo } = scenario;

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.billing.setPlans({
					customer_id: customerId!,
					carry_over_usages: { enabled: true },
					phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.billing.setPlans({
					customer_id: customerId!,
					carry_over_usages: { enabled: true },
					phases: [
						{
							starts_at: advancedTo + ms.days(7),
							plans: [{ plan_id: premium.id }],
						},
					],
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.billing.setPlans({
					customer_id: customerId!,
					carry_over_usages: { enabled: true },
					phases: [
						{ starts_at: "now", plans: [{ plan_id: pro.id }] },
						{
							starts_at: advancedTo + ms.days(7),
							plans: [{ plan_id: premium.id }],
						},
					],
				}),
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_2.billing.setPlans(
					switchToPremium({
						scenario,
						carryOverUsages: {
							enabled: true,
							feature_ids: [TestFeature.Dashboard],
						},
					}),
				),
		});

		await expectUsage({ scenario, messages: 150, words: 100 });
	},
);
