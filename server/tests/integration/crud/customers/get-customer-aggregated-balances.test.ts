import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type LimitedItem,
	ProductItemInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireAllCusEntsForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

// ─────────────────────────────────────────────────────────────────
// Customer-level aggregated balance should include rollover balance
// and usage across all entity-scoped cusEnts. Exercises:
//   1. Fresh DB rebuild (skip_cache)  -> SQL aggregate with rollover sums
//   2. Lua reset-time rollover insert -> _aggregated.rollover_balance bump
//   3. Lua post-reset deduction       -> _aggregated.rollover_balance/_usage
// ─────────────────────────────────────────────────────────────────

test.concurrent(`${chalk.yellowBright("customer aggregated balance: rollover balance + usage propagate across reset and deduction")}`, async () => {
	const rolloverConfig = {
		max: 500,
		length: 1,
		duration: RolloverExpiryDurationType.Month,
	};

	const messagesItem = constructFeatureItem({
		featureId: TestFeature.Messages,
		includedUsage: 100,
		interval: ProductItemInterval.Month,
		entityFeatureId: TestFeature.Users,
		rolloverConfig,
	}) as LimitedItem;

	const base = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, autumnV2_2, ctx, entities } =
		await initScenario({
			customerId: "customer-agg-rollovers",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [base] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: base.id })],
		});

	// ── Step 1: Track 60 on ent-0, 30 on ent-1 ──
	// Expected per-entity balance: ent-0 = 40, ent-1 = 70.
	// Customer aggregated: remaining = 110, usage = 90.
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 60,
	});
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entities[1].id,
		feature_id: TestFeature.Messages,
		value: 30,
	});

	await new Promise((resolve) => setTimeout(resolve, 2000));

	const preReset = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: preReset,
		featureId: TestFeature.Messages,
		remaining: 110,
		usage: 90,
	});

	const preResetDb = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
		skip_cache: "true",
	});
	expectBalanceCorrect({
		customer: preResetDb,
		featureId: TestFeature.Messages,
		remaining: 110,
		usage: 90,
	});

	// ── Step 2: Expire cusEnts; next read triggers lazy reset + rollover insert ──
	// After reset:
	//   - main balance resets to 100 per entity (total 200)
	//   - rollover inserted with ent-0 = 40, ent-1 = 70 (capped at 500, no clip)
	//   - rollover usage = 0
	// Customer aggregated: remaining = 200 + 110 = 310, usage = 0.
	await expireAllCusEntsForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});

	// Force lazy reset to run via customer read + entity reads.
	await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await autumnV2_2.entities.get(customerId, entities[0].id);
	await autumnV2_2.entities.get(customerId, entities[1].id);

	const postReset = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: postReset,
		featureId: TestFeature.Messages,
		remaining: 310,
		usage: 0,
	});

	const postResetDb = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{ skip_cache: "true" },
	);
	expectBalanceCorrect({
		customer: postResetDb,
		featureId: TestFeature.Messages,
		remaining: 310,
		usage: 0,
	});

	// ── Step 3: Track 50 on ent-0 — consumes ent-0's rollover (40) + 10 main ──
	// After track:
	//   - ent-0 main = 90, ent-0 rollover balance = 0, ent-0 rollover usage = 40
	//   - ent-1 main = 100, ent-1 rollover balance = 70
	// Customer aggregated: remaining = (90 + 100) + (0 + 70) = 260, usage = 50.
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 50,
	});

	await new Promise((resolve) => setTimeout(resolve, 1500));

	const postDeduct = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer: postDeduct,
		featureId: TestFeature.Messages,
		remaining: 260,
		usage: 50,
	});
});
