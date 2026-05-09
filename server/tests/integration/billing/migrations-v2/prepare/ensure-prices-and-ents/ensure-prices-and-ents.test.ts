/**
 * TDD coverage for ensure_prices_and_entitlements preparation.
 *
 * Contract under test:
 *   - prepared catalog rows are content-addressed by the exact update_plan input
 *     and operation position.
 *   - unchanged add_items keep their prepared row IDs across migration edits.
 *   - changed add_items/base prices receive new prepared row IDs.
 */

import { expect, test } from "bun:test";
import type { Price } from "@autumn/shared";
import { prepare } from "@/internal/migrations/v2/prepare/prepare.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { initScenario } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	buildUpdatePlanOperations,
	createMigration,
	updateMigrationOperations,
} from "../../utils/migrationTestUtils.js";
import {
	prepaidWordsWithMaxPurchase,
	rolloverCredits,
} from "./utils/ensurePrepareItems.js";
import {
	expectPreparedArtifact,
	expectPreparedArtifactFieldsChanged,
	expectPreparedArtifactFieldsStable,
	expectPreparedArtifactRowIds,
	expectPreparedCatalogContainsRows,
	prepareMigration,
} from "./utils/ensurePrepareTestUtils.js";

test.concurrent(`${chalk.yellowBright("migrations prepare: unchanged add_items keep row IDs while edited add_items change")}`, async () => {
	const id = "prep-ensure-stable-add-items";
	const { autumnV2_2, ctx } = await initScenario({
		setup: [],
		actions: [],
	});

	const firstOps = buildUpdatePlanOperations({
		customize: {
			add_items: [itemsV2.dashboard(), itemsV2.prepaidWords({ amount: 2 })],
		},
	});
	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id,
		operations: firstOps,
	});
	const first = await prepareMigration({ ctx, migration });

	const secondOps = buildUpdatePlanOperations({
		customize: {
			add_items: [itemsV2.dashboard(), itemsV2.prepaidWords({ amount: 3 })],
		},
	});
	const updatedMigration = await updateMigrationOperations({
		migrationClient: autumnV2_2,
		id,
		operations: secondOps,
	});
	expect(updatedMigration.prepared_state).toBeNull();
	const second = await prepareMigration({ ctx, migration: updatedMigration });

	expectPreparedArtifactFieldsStable({
		before: first,
		after: second,
		artifact: { opIndex: 0, kind: "add_item", itemIndex: 0 },
		fields: ["entitlement_id"],
	});

	expectPreparedArtifactFieldsChanged({
		before: first,
		after: second,
		artifact: { opIndex: 0, kind: "add_item", itemIndex: 1 },
		fields: ["hash", "price_id", "entitlement_id"],
	});
});

test.concurrent(`${chalk.yellowBright("migrations prepare: base price create update and remove rewrite prepared_state")}`, async () => {
	const id = "prep-ensure-base-price";
	const { autumnV2_2, ctx } = await initScenario({
		setup: [],
		actions: [],
	});

	const createOps = buildUpdatePlanOperations({
		customize: { price: itemsV2.monthlyPrice({ amount: 20 }) },
	});
	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id,
		operations: createOps,
	});
	const created = await prepareMigration({ ctx, migration });
	const createdBasePrice = expectPreparedArtifact({
		result: created,
		opIndex: 0,
		kind: "base_price",
	});
	expect(created.result.prices).toHaveLength(1);
	expect((created.result.prices[0] as Price).internal_product_id).toBeNull();

	const updateOps = buildUpdatePlanOperations({
		customize: { price: itemsV2.monthlyPrice({ amount: 25 }) },
	});
	const updatedMigration = await updateMigrationOperations({
		migrationClient: autumnV2_2,
		id,
		operations: updateOps,
	});
	const updated = await prepareMigration({ ctx, migration: updatedMigration });
	expectPreparedArtifactFieldsChanged({
		before: created,
		after: updated,
		artifact: { opIndex: 0, kind: "base_price" },
		fields: ["hash", "price_id"],
	});
	expect(createdBasePrice.price_id).toBeDefined();

	const removeOps = buildUpdatePlanOperations({ customize: { price: null } });
	const removedMigration = await updateMigrationOperations({
		migrationClient: autumnV2_2,
		id,
		operations: removeOps,
	});
	const { preparedState: removedState } = await prepare({
		ctx,
		migration: removedMigration,
		dryRun: false,
	});
	expect(removedState).toEqual({});
});

test.concurrent(`${chalk.yellowBright("migrations prepare: nested item field changes produce new artifacts")}`, async () => {
	const id = "prep-ensure-nested-item-hash";
	const { autumnV2_2, ctx } = await initScenario({
		setup: [],
		actions: [],
	});

	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id,
		operations: buildUpdatePlanOperations({
			customize: {
				add_items: [prepaidWordsWithMaxPurchase({ maxPurchase: 100 })],
			},
		}),
	});
	const first = await prepareMigration({ ctx, migration, dryRun: true });

	const maxPurchaseMigration = await updateMigrationOperations({
		migrationClient: autumnV2_2,
		id,
		operations: buildUpdatePlanOperations({
			customize: {
				add_items: [prepaidWordsWithMaxPurchase({ maxPurchase: 101 })],
			},
		}),
	});
	const maxPurchase = await prepareMigration({
		ctx,
		migration: maxPurchaseMigration,
		dryRun: true,
	});
	expectPreparedArtifactFieldsChanged({
		before: first,
		after: maxPurchase,
		artifact: { opIndex: 0, kind: "add_item", itemIndex: 0 },
		fields: ["hash", "price_id", "entitlement_id"],
	});

	const rolloverMigration = await updateMigrationOperations({
		migrationClient: autumnV2_2,
		id,
		operations: buildUpdatePlanOperations({
			customize: { add_items: [rolloverCredits({ max: 250 })] },
		}),
	});
	const rollover = await prepareMigration({
		ctx,
		migration: rolloverMigration,
		dryRun: true,
	});

	const rolloverChangedMigration = await updateMigrationOperations({
		migrationClient: autumnV2_2,
		id,
		operations: buildUpdatePlanOperations({
			customize: { add_items: [rolloverCredits({ max: 251 })] },
		}),
	});
	const rolloverChanged = await prepareMigration({
		ctx,
		migration: rolloverChangedMigration,
		dryRun: true,
	});
	expectPreparedArtifactFieldsChanged({
		before: rollover,
		after: rolloverChanged,
		artifact: { opIndex: 0, kind: "add_item", itemIndex: 0 },
		fields: ["hash", "entitlement_id"],
	});
});

test.concurrent(`${chalk.yellowBright("migrations prepare: same item on different op indexes gets distinct rows")}`, async () => {
	const id = "prep-ensure-op-index-isolation";
	const { autumnV2_2, ctx } = await initScenario({
		setup: [],
		actions: [],
	});

	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id,
		operations: buildUpdatePlanOperations({
			customize: { add_items: [itemsV2.prepaidWords({ amount: 6 })] },
			secondCustomize: {
				add_items: [itemsV2.prepaidWords({ amount: 6 })],
			},
		}),
	});
	const prepared = await prepareMigration({ ctx, migration });

	const first = expectPreparedArtifact({
		result: prepared,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 0,
	});
	const second = expectPreparedArtifact({
		result: prepared,
		opIndex: 1,
		kind: "add_item",
		itemIndex: 0,
	});
	expect(second.hash).toBe(first.hash);
	expect(second.price_id).not.toBe(first.price_id);
	expect(second.entitlement_id).not.toBe(first.entitlement_id);
	const firstRows = expectPreparedArtifactRowIds({ artifact: first });
	const secondRows = expectPreparedArtifactRowIds({ artifact: second });
	expectPreparedCatalogContainsRows({
		result: prepared,
		priceIds: [firstRows.priceId, secondRows.priceId],
		entitlementIds: [firstRows.entitlementId, secondRows.entitlementId],
	});
});
