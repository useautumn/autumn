import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { logPlaybook } from "../catalog/utils/catalogScenario";

/**
 * Threshold billing QA: an item with `threshold_billing` bills its overage
 * mid-cycle as soon as unbilled usage reaches the threshold, instead of
 * waiting for the cycle to end.
 *
 * Both plans below carry threshold 20 on a $1/unit usage-based monthly item.
 * They differ only in included usage, which is the variable under test:
 *   T1 included 0   → every tracked unit is overage
 *   T2 included 100 → the first 100 units are free, overage starts after
 */

const THRESHOLD = 20;
const UNIT_PRICE = 1;

const thresholdPlan = ({
	planId,
	included,
}: {
	planId: string;
	included: number;
}) =>
	products.base({
		id: planId,
		items: [
			{
				...items.consumableMessages({
					includedUsage: included,
					price: UNIT_PRICE,
				}),
				config: { threshold_billing: { threshold: THRESHOLD } },
			},
		],
	});

const printOutcome = async ({
	label,
	customerId,
	autumnV2_3,
	ctx,
}: {
	label: string;
	customerId: string;
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
}) => {
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	console.log(chalk.bold(`\n─── ${label} ───`));
	console.log({
		customer_id: customerId,
		balance: customer.balances?.[TestFeature.Messages],
	});

	const invoices = await ctx.stripeCli.invoices.list({
		customer: customer.stripe_id as string,
	});
	console.table(
		invoices.data.map((invoice) => ({
			id: invoice.id,
			total: invoice.total / 100,
			status: invoice.status,
			description: invoice.lines.data[0]?.description?.slice(0, 60),
		})),
	);
};

test(
	`${chalk.yellowBright("scenario: threshold billing with no included usage")}`,
	async () => {
		const customerId = "thr-scenario-zero";
		const plan = thresholdPlan({ planId: "thr-zero-plan", included: 0 });

		// 25 units of overage crosses the threshold of 20 → expect a mid-cycle charge.
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({ featureId: TestFeature.Messages, value: 25, timeout: 8_000 }),
			],
		});

		await printOutcome({
			label:
				"included 0, tracked 25, threshold 20 → expect a $25 mid-cycle invoice",
			customerId,
			autumnV2_3,
			ctx,
		});
	},
	{ timeout: 240_000 },
);

test(
	`${chalk.yellowBright("scenario: threshold billing with included usage")}`,
	async () => {
		const customerId = "thr-scenario-included";
		const plan = thresholdPlan({ planId: "thr-inc-plan", included: 100 });

		// 130 tracked, 100 included → 30 overage, past the threshold of 20.
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 130,
					timeout: 8_000,
				}),
			],
		});

		await printOutcome({
			label:
				"included 100, tracked 130 (30 overage), threshold 20 → does it charge?",
			customerId,
			autumnV2_3,
			ctx,
		});

		logPlaybook({
			title: "Threshold billing",
			steps: [
				`Customers → "thr-scenario-zero" → Invoices: a mid-cycle invoice should exist for the overage, raised as soon as usage crossed ${THRESHOLD} units.`,
				`Customers → "thr-scenario-included" → Invoices: compare. This is the shape that did not fire on "asdfasdfasdf".`,
				`Plans → either plan → the Messages item → Advanced → "Threshold billing" shows ${THRESHOLD} in the "Bill every" field.`,
				`Track more usage on either customer and watch for a further invoice each time another ${THRESHOLD} units accumulate.`,
			],
		});
	},
	{ timeout: 240_000 },
);
