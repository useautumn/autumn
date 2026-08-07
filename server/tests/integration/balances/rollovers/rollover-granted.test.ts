/**
 * TDD tests for the `granted` field on API rollover objects.
 *
 * Contract under test:
 *   New types/fields:
 *     - ApiBalanceRollover.granted: number — the amount that rolled in from the
 *       previous period, before any of it was consumed. Equals that rollover's
 *       remaining balance plus the usage already taken out of it.
 *   New behaviors:
 *     - flat (non-entity) ent: a rollover partially consumed by track keeps
 *       `granted` at the rolled-in amount while `balance` drops
 *     - entity-scoped read (GET entity): `granted` is that entity's own
 *       rolled-in amount, not the customer-wide total
 *     - entity-aggregated read (GET customer): `granted` sums every entity's
 *       rolled-in amount, including usage already consumed per entity
 *     - sum(rollovers[].granted) reconciles with the balance's top-level
 *       `granted`, which is allowance + total rollover granted
 *     - the cached full-subject read reports the same rollovers as the
 *       skip_cache read — rollover `usage` survives the cache round trip
 *   Versions:
 *     - present on 2.2 (ApiBalanceV1) and 2.0 (ApiBalance) — they share
 *       ApiBalanceRolloverSchema
 *     - absent on 1.2 and below, where the transform output is parsed against
 *       ApiCusFeatureV3RolloverSchema and the unknown key is stripped
 *   Side effects:
 *     - none; `granted` is derived from the existing rollovers.usage column
 *
 * Pre-impl red: `granted` is undefined everywhere, because cusEntsToRollovers
 * drops rolloverFields.rollovers[].usage when it builds ApiBalanceRollover.
 * Post-impl green: cusEntsToRollovers emits balance + usage as `granted` and
 * ApiBalanceRolloverSchema declares it.
 */

import { expect, test } from "bun:test";
import type {
	ApiCustomer,
	ApiCustomerV3,
	ApiCustomerV5,
	ApiEntityV2,
} from "@autumn/shared";
import { RolloverExpiryDurationType } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import {
	fetchCustomerEntitlementRow,
	fetchRollovers,
	runBatchResetV2,
	waitForPostgresBalance,
} from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

const INCLUDED_USAGE = 100;
const ROLLOVER_CONFIG = {
	max: 1000,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

/** Polls the cusEnt row until `predicate` sees the deduction land in Postgres. */
const waitForEntitiesSynced = async ({
	db,
	customerEntitlementId,
	predicate,
}: {
	db: DrizzleCli;
	customerEntitlementId: string;
	predicate: (entities: Record<string, { balance: number }>) => boolean;
}) => {
	const startedAt = Date.now();
	while (true) {
		const row = await fetchCustomerEntitlementRow({
			db,
			customerEntitlementId,
		});
		const entities = (row.entities ?? {}) as Record<
			string,
			{ balance: number }
		>;
		if (predicate(entities)) return;
		if (Date.now() - startedAt > 15_000) {
			throw new Error(
				`entity deduction never synced to PG: ${JSON.stringify(entities)}`,
			);
		}
		await timeout(500);
	}
};

test.concurrent(
	`${chalk.yellowBright("rollover granted: flat ent keeps granted at the rolled-in amount while balance drains")}`,
	async () => {
		const customerId = "rollover-granted-flat";
		const plan = products.base({
			id: "rollover-granted-flat-plan",
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: INCLUDED_USAGE,
					rolloverConfig: ROLLOVER_CONFIG,
				}),
			],
		});

		const { ctx, autumnV1, autumnV2, autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 70,
					timeout: 3000,
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
			expectedBalance: INCLUDED_USAGE - 70,
		});

		// Reset the period so the unused 30 rolls over.
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		const rolloverRows = await fetchRollovers({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(rolloverRows.length).toBe(1);
		expect(rolloverRows[0].balance).toBe(30);

		// Consume 10 of the rollover — deduction drains rollovers before the
		// fresh allowance, so this leaves balance 20 / usage 10 on that row.
		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await timeout(3000);

		// ── Contract: granted is the rolled-in amount, not the remainder ──
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		const messages = customer.balances[TestFeature.Messages];
		expect(messages.rollovers?.length).toBe(1);
		expect(messages.rollovers?.[0].granted).toBe(30);
		expect(messages.rollovers?.[0].balance).toBe(20);

		// ── Contract: rollover granted reconciles with the top-level total ──
		const rolloverGranted = (messages.rollovers ?? []).reduce(
			(total, rollover) => total + rollover.granted,
			0,
		);
		expect(messages.granted).toBe(INCLUDED_USAGE + rolloverGranted);
		expect(messages.remaining).toBe(INCLUDED_USAGE + 20);
		expect(messages.usage).toBe(10);

		// ── Contract: 2.0 shares the schema, so it carries granted too ──────
		const customerV2_0 = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		const messagesV2_0 = customerV2_0.balances[TestFeature.Messages];
		expect(messagesV2_0.rollovers?.[0].granted).toBe(30);
		expect(messagesV2_0.rollovers?.[0].balance).toBe(20);

		// ── Contract: 1.2 and below stay on the old shape — stripped ────────
		const customerV1_2 = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
			{ skip_cache: "true" },
		);
		const messagesV1_2 = customerV1_2.features[TestFeature.Messages];
		const legacyRollover = messagesV1_2.rollovers?.[0] as
			| Record<string, unknown>
			| undefined;
		expect(legacyRollover?.balance).toBe(20);
		expect(legacyRollover?.granted).toBeUndefined();

		// ── Contract: the cached read reports granted identically ───────────
		// The first plain read hydrates the cached full subject from Postgres;
		// the second is served from it. Rollover rows carry `usage` through the
		// cache, so the cached read must not degrade to balance-only.
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const cachedCustomer =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const cachedMessages = cachedCustomer.balances[TestFeature.Messages];
		expect(cachedMessages.rollovers).toEqual(messages.rollovers);
		expect(cachedMessages.rollovers?.[0].granted).toBe(30);
		expect(cachedMessages.rollovers?.[0].balance).toBe(20);
		expect(cachedMessages.granted).toBe(messages.granted);
	},
);

test.concurrent(
	`${chalk.yellowBright("rollover granted: entity read is per-entity, customer read aggregates across entities")}`,
	async () => {
		const customerId = "rollover-granted-entity";
		const plan = products.base({
			id: "rollover-granted-entity-plan",
			items: [
				constructFeatureItem({
					featureId: TestFeature.Messages,
					includedUsage: INCLUDED_USAGE,
					entityFeatureId: TestFeature.Users,
					rolloverConfig: ROLLOVER_CONFIG,
				}),
			],
		});

		const { ctx, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 40,
					entityIndex: 0,
					timeout: 3000,
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await waitForEntitiesSynced({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
			predicate: (entities) =>
				Object.values(entities).some(
					(entity) => entity.balance === INCLUDED_USAGE - 40,
				),
		});

		// Reset: ent-1 rolls over 60, ent-2 rolls over the full 100.
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		// Consume 10 of ent-1's rollover: ent-1 becomes balance 50 / usage 10.
		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: "ent-1",
			feature_id: TestFeature.Messages,
			value: 10,
		});
		await timeout(3000);

		// ── Contract: entity read reports that entity's rolled-in amount ────
		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			"ent-1",
			{ skip_cache: "true" },
		);
		const entityMessages = entity.balances[TestFeature.Messages];
		expect(entityMessages.rollovers?.length).toBe(1);
		expect(entityMessages.rollovers?.[0].granted).toBe(60);
		expect(entityMessages.rollovers?.[0].balance).toBe(50);
		expect(entityMessages.granted).toBe(INCLUDED_USAGE + 60);

		// ── Contract: customer read sums rolled-in amounts across entities ──
		// 60 (ent-1, 10 of it consumed) + 100 (ent-2, untouched) = 160.
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		const messages = customer.balances[TestFeature.Messages];
		expect(messages.rollovers?.length).toBe(1);
		expect(messages.rollovers?.[0].granted).toBe(160);
		expect(messages.rollovers?.[0].balance).toBe(150);
	},
);
