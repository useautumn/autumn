import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { deleteLock } from "@tests/integration/balances/utils/lockUtils/deleteLock.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/** A customer with 10 monthly messages and an 8-message lock under `lockId`. */
const initLocked = async ({ customerId }: { customerId: string }) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 10 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.otherCustomers([{ id: `${customerId}-other` }]),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: free.id })],
	});
	await deleteLock({ ctx: scenario.ctx, lockId: customerId });
	await scenario.autumnV2_5.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: 8,
		lock: { enabled: true, lock_id: customerId },
	});
	return scenario;
};

test.concurrent(
	`${chalk.yellowBright("finalize-customer-id1: at 2.5 a finalize names only its lock")}`,
	async () => {
		const customerId = "finalize-customer-id1";
		const { autumnV2_5 } = await initLocked({ customerId });

		await autumnV2_5.balances.finalize({
			lock_id: customerId,
			action: "release",
		});

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 10,
		});
	},
);

test.skipIf(!isBalanceWorkerRoute())(
	`${chalk.yellowBright("finalize-customer-id2: at 2.6 a finalize names its customer; another customer's id finds no worker lock")}`,
	async () => {
		const customerId = "finalize-customer-id2";
		const { autumnV2_6 } = await initLocked({ customerId });

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: () =>
				autumnV2_6.balances.finalize({
					lock_id: customerId,
					action: "release",
					customer_id: `${customerId}-other`,
				}),
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 2,
		});

		await autumnV2_6.balances.finalize({
			lock_id: customerId,
			action: "release",
			customer_id: customerId,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 10,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("finalize-customer-id3: at 2.6 a finalize that names no customer, or an empty one, is refused by the schema")}`,
	async () => {
		const customerId = "finalize-customer-id3";
		const { autumnV2_6 } = await initLocked({ customerId });

		for (const unnamed of [{}, { customer_id: "" }])
			await expectAutumnError({
				errCode: ErrCode.InvalidInputs,
				func: () =>
					autumnV2_6.balances.finalize({
						lock_id: customerId,
						action: "release",
						...unnamed,
					} as never),
			});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 2,
		});
	},
);

test.skipIf(isBalanceWorkerRoute())(
	`${chalk.yellowBright("finalize-customer-id4: at 2.6 a Redis lock settles by its lock_id, whatever customer the finalize names")}`,
	async () => {
		const customerId = "finalize-customer-id4";
		const { autumnV2_6 } = await initLocked({ customerId });

		await autumnV2_6.balances.finalize({
			lock_id: customerId,
			action: "release",
			customer_id: `${customerId}-other`,
		});

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 10,
		});
	},
);
