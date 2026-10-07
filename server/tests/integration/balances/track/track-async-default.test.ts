import { expect, test } from "bun:test";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const setupCustomer = async ({ customerId }: { customerId: string }) => {
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	return initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});
};

test.concurrent(
	`${chalk.yellowBright("track-async-default1: 2.5 queues by default and applies the usage later")}`,
	async () => {
		const { autumnV2_5, customerId } = await setupCustomer({
			customerId: "track-async-default1",
		});

		const queued = await autumnV2_5.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		});

		expect(queued).toEqual({
			customer_id: customerId,
			value: 3,
			balance: null,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_5,
			featureId: TestFeature.Messages,
			remaining: 97,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-async-default2: 2.5 with async: false applies before responding")}`,
	async () => {
		const { autumnV2_5, customerId } = await setupCustomer({
			customerId: "track-async-default2",
		});

		const applied = await autumnV2_5.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
			async: false,
		});

		expect(applied.balance.remaining).toBe(97);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-async-default3: 2.4 stays sync by default and queues on async: true")}`,
	async () => {
		const { autumnV2_4, customerId } = await setupCustomer({
			customerId: "track-async-default3",
		});
		const body = {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 3,
		};

		const applied = await autumnV2_4.track(body);
		expect(applied.balance.remaining).toBe(97);

		const queued = await autumnV2_4.track({ ...body, async: true });
		expect(queued.balance).toBeNull();
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_4,
			featureId: TestFeature.Messages,
			remaining: 94,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("track-async-default4: track_tokens queues by default on 2.5 and stays sync on 2.4")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [
				items.free({ featureId: TestFeature.AiCredits, includedUsage: 1000 }),
			],
		});
		const { autumnV2_4, autumnV2_5, customerId } = await initScenario({
			customerId: "track-async-default4",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.attach({ productId: free.id })],
		});
		const body = {
			customer_id: customerId,
			feature_id: TestFeature.AiCredits,
			model_id: "openai/gpt-4o",
			input_tokens: 1000,
			output_tokens: 500,
		};

		const queued = await autumnV2_5.post("/track_tokens", body);
		expect(queued.balance).toBeNull();

		const applied = await autumnV2_4.post("/track_tokens", body);
		expect(applied.balance.remaining).toBeLessThan(1000);
	},
);

test.concurrent(
	`${chalk.yellowBright("track-async-default6: 2.4 batch items with async still succeed")}`,
	async () => {
		const { autumnV2_4, autumnV2_5, customerId } = await setupCustomer({
			customerId: "track-async-default6",
		});
		const item = {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		};

		expect(
			await autumnV2_4.post("/balances.batch_track", [
				{ ...item, async: false },
				{ ...item, async: true },
			]),
		).toEqual({ success: true });
		expect(await autumnV2_5.post("/balances.batch_track", [item])).toEqual({
			success: true,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_5,
			featureId: TestFeature.Messages,
			remaining: 94,
		});
	},
);
