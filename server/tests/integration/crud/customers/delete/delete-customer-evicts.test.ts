import { test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expectWorkerHoldsNoSubject } from "@tests/utils/expectWorkerHoldsNoSubject.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("delete-customer-evicts: a sandbox reset leaves the worker no state for its customers")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, ctx, autumnV2_4 } = await initScenario({
			customerId: "delete-customer-evicts",
			setup: [
				s.platform.create({ setupDefaultFeatures: true }),
				s.customer({ testClock: false }),
				s.products({ list: [free] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});
		await autumnV2_4.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await autumnV2_4.post("/sandboxes.reset", {});

		await expectWorkerHoldsNoSubject({
			org: ctx.org,
			env: AppEnv.Sandbox,
			customerId,
		});
	},
	180_000,
);
