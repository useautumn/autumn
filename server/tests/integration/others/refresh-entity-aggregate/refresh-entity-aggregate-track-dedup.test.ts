/**
 * Observable result of 20 tracks spread across ~3s on a per-entity balance:
 * each lands exactly once. The one-refresh-per-bucket enqueue lives in the worker
 * process, so unit/balances/syncItemV4-refresh-dedup.test.ts asserts it.
 */

import { test } from "bun:test";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const INCLUDED_USAGE = 500;
const TRACK_COUNT = 20;

test(`${chalk.yellowBright(
	"refresh-dedup-track: 20 concurrent tracks across 3s → entity balance reflects each exactly once",
)}`, async () => {
	const customerId = "refresh-agg-dedup-cus";

	const perEntityMessages = items.monthlyMessages({
		includedUsage: INCLUDED_USAGE,
		entityFeatureId: TestFeature.Users,
	});
	const prod = products.base({
		id: "refresh-agg-dedup",
		items: [perEntityMessages],
	});

	const { autumnV2_2, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.products({ list: [prod] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: prod.id })],
	});

	await Promise.all(
		Array.from({ length: TRACK_COUNT }, async (_, i) => {
			await timeout(i * 150); // 20 * 150ms ≈ 3s spread
			return autumnV2_2.track({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				value: 1,
			});
		}),
	);

	await expectBalanceCorrect({
		autumn: autumnV2_2,
		customerId,
		entityId: entities[0].id,
		featureId: TestFeature.Messages,
		granted: INCLUDED_USAGE,
		remaining: INCLUDED_USAGE - TRACK_COUNT,
		usage: TRACK_COUNT,
	});
}, 60_000);
