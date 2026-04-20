import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import {
	cleanupOrgRollout,
	removeCachedAtField,
	setOrgRolloutPercent,
} from "@tests/utils/rolloutTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const testCase = "rollout-track-transition";

test(
	`${chalk.yellowBright(`${testCase}: track across v1 → v2 → v1 rollout transitions`)}`,
	async () => {
		const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({
			id: "free",
			items: [monthlyMessages],
		});

		const customerId = `${testCase}`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const orgId = ctx.org.id;

		// ── Phase 1: rollout at 0% (v1 path) ──────────────────────────────
		await setOrgRolloutPercent({ orgId, percent: 0 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterTrack1 =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterTrack1,
			featureId: TestFeature.Messages,
			remaining: 90,
		});

		// ── Phase 2: rollout to 100% (v2 path) ────────────────────────────
		await setOrgRolloutPercent({ orgId, percent: 100 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterTrack2 =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterTrack2,
			featureId: TestFeature.Messages,
			remaining: 80,
		});

		// ── Phase 3: rollout back to 0% (v1 path) ─────────────────────────
		await setOrgRolloutPercent({ orgId, percent: 0 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterTrack3 =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterTrack3,
			featureId: TestFeature.Messages,
			remaining: 70,
		});

		// ── Cleanup ────────────────────────────────────────────────────────
		await cleanupOrgRollout({ orgId });
	},
	{ timeout: 120_000 },
);

// ─────────────────────────────────────────────────────────────────────────────
// Case A: v1 track -> remove _cachedAt (legacy) -> v2 track -> rollback v1 track
// Verifies that missing _cachedAt triggers conservative staleness eviction,
// and that v2 deductions are preserved when rolling back to v1.
// ─────────────────────────────────────────────────────────────────────────────

test(
	`${chalk.yellowBright("rollout-staleness-a: legacy _cachedAt removal across v1 → v2 → v1")}`,
	async () => {
		const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({
			id: "free",
			items: [monthlyMessages],
		});

		const customerId = "rollout-staleness-a";

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const orgId = ctx.org.id;

		// ── Phase 1: track on v1 (rollout 0%) ─────────────────────────────
		await setOrgRolloutPercent({ orgId, percent: 0 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterV1Track =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterV1Track,
			featureId: TestFeature.Messages,
			remaining: 90,
		});

		// ── Strip _cachedAt to simulate legacy cache entry ────────────────
		await removeCachedAtField({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
		});

		// ── Phase 2: roll to 100%, track on v2 ───────────────────────────
		await setOrgRolloutPercent({ orgId, percent: 100 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterV2Track =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterV2Track,
			featureId: TestFeature.Messages,
			remaining: 80,
		});

		// ── Phase 3: rollback to 0%, track on v1 ─────────────────────────
		await setOrgRolloutPercent({ orgId, percent: 0 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterRollback =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterRollback,
			featureId: TestFeature.Messages,
			remaining: 70,
		});

		await cleanupOrgRollout({ orgId });
	},
	{ timeout: 120_000 },
);

// ─────────────────────────────────────────────────────────────────────────────
// Case B: v2 track -> rollback v1 track -> roll forward v2 track
// Verifies full round-trip: no deductions lost across v2 → v1 → v2.
// ─────────────────────────────────────────────────────────────────────────────

test(
	`${chalk.yellowBright("rollout-staleness-b: v2 → v1 → v2 round-trip preserves balances")}`,
	async () => {
		const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({
			id: "free",
			items: [monthlyMessages],
		});

		const customerId = "rollout-staleness-b";

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const orgId = ctx.org.id;

		// ── Phase 1: track on v2 (rollout 100%) ──────────────────────────
		await setOrgRolloutPercent({ orgId, percent: 100 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterV2Track =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterV2Track,
			featureId: TestFeature.Messages,
			remaining: 90,
		});

		// ── Phase 2: rollback to 0%, track on v1 ─────────────────────────
		await setOrgRolloutPercent({ orgId, percent: 0 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterV1Track =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterV1Track,
			featureId: TestFeature.Messages,
			remaining: 80,
		});

		// ── Phase 3: roll forward to 100%, track on v2 ───────────────────
		await setOrgRolloutPercent({ orgId, percent: 100 });

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});

		await timeout(2000);

		const customerAfterRoundTrip =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: customerAfterRoundTrip,
			featureId: TestFeature.Messages,
			remaining: 70,
		});

		await cleanupOrgRollout({ orgId });
	},
	{ timeout: 120_000 },
);
