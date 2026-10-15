/**
 * Unlimited grants under `combine`: under max unlimited wins, under min any
 * limited value wins and unlimited only applies when nothing limits it.
 *
 * Contract:
 *   - max: 1,000 + unlimited → unlimited (PRD case 8).
 *   - min: 24 + unlimited → 24 (decision 2); the limited plan leaving → unlimited.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { expectCombinePoolCorrect } from "./utils/expectCombinePoolCorrect.js";

const limited = ({
	featureId,
	amount,
}: {
	featureId: string;
	amount: number;
}) =>
	constructFeatureItem({ featureId, includedUsage: amount, interval: null });
const unlimited = ({ featureId }: { featureId: string }) =>
	constructFeatureItem({ featureId, unlimited: true, interval: null });

test.concurrent(chalk.yellowBright("combine max: unlimited wins"), async () => {
	const customerId = "combine-max-unlimited";
	const featureId = TestFeature.CombineMaxSeats;
	const pro = products.base({
		id: "combine-max-unlimited-pro",
		items: [limited({ featureId, amount: 1000 })],
	});
	const enterprise = products.base({
		id: "combine-max-unlimited-enterprise",
		isAddOn: true,
		items: [unlimited({ featureId })],
	});

	const { autumnV2_3, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [pro, enterprise] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: enterprise.id }),
		],
	});

	await expectCombinePoolCorrect({
		db: ctx.db,
		customerId,
		featureId,
		granted: 1000,
		unlimited: true,
		competingContributions: [0, 1000],
	});
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expect(customer.balances[featureId]?.unlimited).toBe(true);
});

test.concurrent(
	chalk.yellowBright("combine min: a limited value beats unlimited"),
	async () => {
		const customerId = "combine-min-unlimited";
		const featureId = TestFeature.CombineMinHours;
		const enterprise = products.base({
			id: "combine-min-unlimited-enterprise",
			items: [unlimited({ featureId })],
		});
		const run = products.base({
			id: "combine-min-unlimited-run",
			isAddOn: true,
			items: [limited({ featureId, amount: 24 })],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [enterprise, run] }),
			],
			actions: [s.billing.attach({ productId: enterprise.id })],
		});

		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			unlimited: true,
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: run.id,
		});
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 24,
			balance: 24,
			unlimited: false,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId,
			granted: 24,
			remaining: 24,
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: run.id,
			cancel_action: "cancel_immediately",
		});
		await expectCombinePoolCorrect({
			db: ctx.db,
			customerId,
			featureId,
			granted: 0,
			unlimited: true,
		});
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(customer.balances[featureId]?.unlimited).toBe(true);
	},
);
