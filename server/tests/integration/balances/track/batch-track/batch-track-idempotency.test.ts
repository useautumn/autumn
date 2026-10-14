import { test } from "bun:test";
import type { ApiCustomerV5, TrackParams } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";

const sleep = (waitMs: number) =>
	new Promise((resolve) => setTimeout(resolve, waitMs));

const initBatchScenario = async (customerId: string) => {
	const freeProd = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 20 })],
	});

	const { autumnV2_3 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	return { autumn: autumnV2_3 };
};

const batchTrack = ({
	autumn,
	body,
}: {
	autumn: AutumnInt;
	body: TrackParams[];
}) => autumn.post("/balances.batch_track", body);

const expectSettledBalance = async ({
	autumn,
	customerId,
	remaining,
}: {
	autumn: AutumnInt;
	customerId: string;
	remaining: number;
}) => {
	const matches = async () => {
		const customer = await autumn.customers.get<ApiCustomerV5>(customerId);
		try {
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				remaining,
			});
			return true;
		} catch {
			return false;
		}
	};

	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline && !(await matches())) {
		await sleep(500);
	}
	await sleep(2_500);

	const customer = await autumn.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining,
	});
};

test.concurrent(
	`${chalk.yellowBright("batch track: same customer+feature items all deduct (no false dedup)")}`,
	async () => {
		const customerId = "batch-idem-same-cus-feature";
		const { autumn } = await initBatchScenario(customerId);

		await batchTrack({
			autumn,
			body: [
				{ customer_id: customerId, feature_id: TestFeature.Messages, value: 5 },
				{ customer_id: customerId, feature_id: TestFeature.Messages, value: 3 },
			],
		});

		await expectSettledBalance({ autumn, customerId, remaining: 12 });
	},
);

test.concurrent(
	`${chalk.yellowBright("batch track: IDENTICAL items (no keys) each deduct")}`,
	async () => {
		const customerId = "batch-idem-identical-items";
		const { autumn } = await initBatchScenario(customerId);

		const item = {
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 2,
		};
		await batchTrack({ autumn, body: [item, item, item] });

		await expectSettledBalance({ autumn, customerId, remaining: 14 });
	},
);

test.concurrent(
	`${chalk.yellowBright("batch track: duplicate body idempotency_key within one batch deducts once")}`,
	async () => {
		const customerId = "batch-idem-dup-key";
		const { autumn } = await initBatchScenario(customerId);

		const suffix = Date.now().toString(36);
		await batchTrack({
			autumn,
			body: [
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 3,
					idempotency_key: `batch-k-${suffix}`,
				},
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 3,
					idempotency_key: `batch-k-${suffix}`,
				},
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 2,
					idempotency_key: `batch-l-${suffix}`,
				},
			],
		});

		await expectSettledBalance({ autumn, customerId, remaining: 15 });
	},
);

test.concurrent(
	`${chalk.yellowBright("batch track: key already used in an earlier batch is dropped, other items still deduct")}`,
	async () => {
		const customerId = "batch-idem-cross-batch";
		const { autumn } = await initBatchScenario(customerId);

		const suffix = Date.now().toString(36);
		const usedKey = `batch-p-${suffix}`;

		await batchTrack({
			autumn,
			body: [
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 4,
					idempotency_key: usedKey,
				},
			],
		});
		await expectSettledBalance({ autumn, customerId, remaining: 16 });

		await batchTrack({
			autumn,
			body: [
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 4,
					idempotency_key: usedKey,
				},
				{
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					idempotency_key: `batch-q-${suffix}`,
				},
			],
		});

		await expectSettledBalance({ autumn, customerId, remaining: 15 });
	},
);
