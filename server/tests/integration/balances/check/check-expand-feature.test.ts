/**
 * A check expands `balance.feature` only when asked for by that name, on both balance routes.
 *
 * Red (before): the balance worker route also expanded it for a bare `feature`; legacy did not.
 * Green (after): both expand it for `balance.feature` alone.
 */

import { expect, test } from "bun:test";
import { ApiVersion, CheckExpand, type CheckResponseV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("check-expand-feature1: only balance.feature expands the balance's feature")}`,
	async () => {
		const plan = products.base({
			id: "check-expand-feature",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const customerId = "check-expand-feature1";
		await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});
		const checkExpanding = (expand: string[]) =>
			autumnV2_3.check<CheckResponseV3>({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				// A bare `feature` is not a documented expand; the body carries it unvalidated.
				expand: expand as CheckExpand[],
			});

		const named = await checkExpanding([CheckExpand.BalanceFeature]);
		const bare = await checkExpanding(["feature"]);

		expect(named.balance?.feature?.id).toBe(TestFeature.Messages);
		expect(bare.balance?.feature).toBeUndefined();
	},
);
