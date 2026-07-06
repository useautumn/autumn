/**
 * Scheduled Switch Entity Boolean Flag Tests (Attach V2)
 *
 * Regression coverage for a bug where boolean flags from the active
 * customer product disappeared from entities.get when:
 *   - the same feature also had a cus_ent on a scheduled (next-cycle)
 *     cus_product, or
 *   - the entity had a loose entity-bound boolean entitlement (e.g. from
 *     a prior plan migration) for the same feature.
 *
 * The repro path:
 *   1. subjectQueryRowToNormalized.partitionCustomerEntitlement writes
 *      `flags[feature_id] = {…}` keyed by feature — last-write-wins.
 *   2. RELEVANT_STATUSES in the SQL CTE includes Scheduled, so scheduled
 *      cus_ents land in row.customer_entitlements alongside the active ones.
 *   3. When the scheduled (or loose-extra) cus_ent gets written last, it
 *      overwrites the active cus_product's flag.
 *   4. normalizedToFullSubject routes the flag into the scheduled
 *      cus_product's customer_entitlements; fullSubjectToCustomerEntitlements
 *      then drops it because orgToInStatuses excludes Scheduled.
 *
 * Production hit: org=mintlify customer=685d19f71cc6af2881ae2f0c
 * entity=68a1e19cabf9f5b161674ce7 — AI_CHAT and other booleans on the
 * active enterprise cus_product silently missing from entities.get.
 */

import { expect, test } from "bun:test";
import { type ApiEntityV2, ApiEntityV2Schema } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Scheduled upgrade cus_product must not shadow active flag
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright(
		"scheduled-switch boolean flags 1: scheduled upgrade cus_product must NOT shadow active cus_product's boolean flag",
	)}`,
	async () => {
		const customerId = "sched-switch-bool-flags-scheduled";

		const pro = products.pro({
			id: "bool-flags-sched-pro",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "bool-flags-sched-premium",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					planSchedule: "end_of_cycle",
				}),
			],
		});

		const entityId = entities[0].id;

		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entityId,
			{ keepInternalFields: true },
		);
		ApiEntityV2Schema.parse(entity);

		expect(entity.flags[TestFeature.Dashboard]).toBeDefined();
		expect(entity.flags[TestFeature.Dashboard]).toMatchObject({
			feature_id: TestFeature.Dashboard,
			plan_id: pro.id,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Loose entity-bound extra must not shadow active flag
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright(
		"scheduled-switch boolean flags 2: loose entity-bound extra must NOT shadow active cus_product's boolean flag",
	)}`,
	async () => {
		const customerId = "sched-switch-bool-flags-loose";

		const customerProd = products.pro({
			id: "bool-flags-loose-pro",
			items: [items.dashboard(), items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2, autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [customerProd] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const entityId = entities[0].id;

		// Pre-existing loose entity-bound Dashboard cus_ent (mimics the
		// cus_ent_3AUV9* leftovers Mintlify carried over from their prior plan).
		await autumnV2.balances.create({
			customer_id: customerId,
			entity_id: entityId,
			feature_id: TestFeature.Dashboard,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: customerProd.id,
			redirect_mode: "if_required",
		});

		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entityId,
			{ keepInternalFields: true },
		);
		ApiEntityV2Schema.parse(entity);

		expect(entity.flags[TestFeature.Dashboard]).toBeDefined();
		expect(entity.flags[TestFeature.Dashboard]).toMatchObject({
			feature_id: TestFeature.Dashboard,
			plan_id: customerProd.id,
		});
	},
);
