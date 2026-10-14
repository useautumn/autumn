/**
 * Config-style values under `combine: "min"`: stacked plans keep the lowest
 * value instead of adding up (refresh hours, fee basis points).
 *
 * Contract:
 *   - Two unpriced plans granting 48 and 24 give 24, not 72 (PRD case 1).
 *   - Equal values (100 + 100) give 100, not 200 (PRD case 2).
 *   - A plan without the feature is left out, never counting as 0 (PRD case 9).
 *   - The pool's contributions list both 48 and 24 as competing, with 24 as the
 *     pool-wide winner.
 *   - A lower plan granted for a while wins, and its removal restores the
 *     previous winner (the "Grant for free" trial).
 */

import { expect, test } from "bun:test";
import type {
	ApiPooledBalanceContributionV0,
	AttachParamsV1Input,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const hoursItem = (hours: number) =>
	constructFeatureItem({
		featureId: TestFeature.CombineMinHours,
		includedUsage: hours,
		interval: null,
	});

test.concurrent(
	chalk.yellowBright("combine min: stacked config values keep the lowest"),
	async () => {
		const customerId = "combine-min-config-values";
		const start = products.base({
			id: "combine-min-start",
			items: [hoursItem(48)],
		});
		const run = products.base({
			id: "combine-min-run",
			isAddOn: true,
			items: [hoursItem(24)],
		});
		const unrelated = products.base({
			id: "combine-min-unrelated",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const trial = products.base({
			id: "combine-min-trial",
			isAddOn: true,
			items: [hoursItem(12)],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [start, run, unrelated, trial] }),
			],
			actions: [s.billing.attach({ productId: start.id })],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMinHours,
			granted: 48,
			remaining: 48,
		});

		// ── 48 + 24 → 24 ────────────────────────────────────────────────
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: run.id,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMinHours,
			granted: 24,
			remaining: 24,
		});

		const { contributions } = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		const { list, winning_contribution_id } = (await autumnV2_3.post(
			"/pooled_balances.list_contributions",
			{
				pooled_balance_id: contributions[0].pooled_balance_id,
				offset: 0,
				limit: 10,
			},
		)) as {
			list: ApiPooledBalanceContributionV0[];
			winning_contribution_id: string | null;
		};
		expect(
			list.map(({ current_contribution, competes, unlimited }) => ({
				current_contribution,
				competes,
				unlimited,
			})),
		).toEqual(
			expect.arrayContaining([
				{ current_contribution: 48, competes: true, unlimited: false },
				{ current_contribution: 24, competes: true, unlimited: false },
			]),
		);

		expect(winning_contribution_id).toBe(
			list.find(({ current_contribution }) => current_contribution === 24)
				?.id ?? "missing",
		);

		// ── A plan without the feature changes nothing ─────────────────────
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: unrelated.id,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMinHours,
			granted: 24,
			remaining: 24,
		});

		// ── A lower trial plan wins while it lasts ─────────────────────────
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: trial.id,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMinHours,
			granted: 12,
			remaining: 12,
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: trial.id,
			cancel_action: "cancel_immediately",
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMinHours,
			granted: 24,
			remaining: 24,
		});
	},
);

test.concurrent(
	chalk.yellowBright("combine min: equal values count once"),
	async () => {
		const customerId = "combine-min-equal-values";
		const feeItem = constructFeatureItem({
			featureId: TestFeature.CombineMinHours,
			includedUsage: 100,
			interval: null,
		});
		const planA = products.base({ id: "combine-min-fee-a", items: [feeItem] });
		const planB = products.base({
			id: "combine-min-fee-b",
			isAddOn: true,
			items: [feeItem],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [planA, planB] }),
			],
			actions: [
				s.billing.attach({ productId: planA.id }),
				s.billing.attach({ productId: planB.id }),
			],
		});

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.CombineMinHours,
			granted: 100,
			remaining: 100,
		});
	},
);
