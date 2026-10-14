import { afterEach, expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { readScopedFeatureRow } from "../../paidRowTestUtils";
import {
	expectVersionRepointedOnce,
	mintPlanVersion,
} from "../utils/versionDiffTestUtils";
import {
	readRepointableCustomerPlanRow,
	runVersionRepointMigration,
} from "../utils/versionRepointTestUtils";

const MESSAGES_USED = 30;
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;

afterEach(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

test(`${chalk.yellowBright("batch version repoint: a routed customer moves version and allowance through the worker, so check sees both at once")}`, async () => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	const stem = `bvr-worker-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
	const customerId = `${stem}-customer`;
	const plan = products.base({
		id: `${stem}-plan`,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyWords({ includedUsage: 25 }),
		],
	});
	const { ctx, autumnV1, autumnV2_3 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.billing.attach({ productId: plan.id })],
	});
	await autumnV2_3.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: MESSAGES_USED,
	});
	await mintPlanVersion({
		client: autumnV2_3,
		planId: plan.id,
		items: [
			itemsV2.monthlyMessages({ included: 500 }),
			itemsV2.monthlyWords({ included: 50 }),
		],
	});
	const before = await readRepointableCustomerPlanRow({
		ctx,
		customerId,
		planId: plan.id,
	});

	const { result } = await runVersionRepointMigration({
		ctx,
		migrationClient: autumnV2_3,
		migrationId: `${stem}-migration`,
		filter: { customer: { plan: { plan_id: plan.id, version: 1 } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: plan.id, version: 1 },
					version: 2,
					customize: {
						remove_items: [{ feature_id: TestFeature.Messages }],
						add_items: [itemsV2.monthlyMessages({ included: 200 })],
					},
				},
			],
		},
	});

	await expectVersionRepointedOnce({
		ctx,
		customerId,
		planId: plan.id,
		before,
		targetVersion: 2,
		result,
		isCustom: true,
	});

	const remaining = 200 - MESSAGES_USED;
	const atRemaining = await autumnV2_3.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: remaining,
	});
	expect(atRemaining.allowed).toBe(true);
	const pastRemaining = await autumnV2_3.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		required_balance: remaining + 1,
	});
	expect(pastRemaining.allowed).toBe(false);

	const messagesAfter = await readScopedFeatureRow({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(messagesAfter.balance).toBe(remaining);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(
		customer.products?.find((product) => product.id === plan.id)?.version,
	).toBe(2);
});
