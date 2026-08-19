/**
 * catalogV2.update — same-call feature op ordering.
 *
 * Compute fold: update → insert → remove (projected after each step).
 * Execute:     insert → update → remove.
 * Inserts sort non-credit-systems before credit systems.
 * Update blockers ignore CS rows inserted in this call; they do see projected
 * schema drops / CS removals. Remove willArchive is stamped on the post-upsert
 * projection (owned by remove/remove-features.test.ts).
 *
 * This file owns every order-dependent CREATE/UPDATE/REMOVE×CS combination
 * that is not already covered as a remove verdict.
 */

import { test } from "bun:test";
import { FeatureType, FeatureUsageType } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	deleteDbFeatures,
	expectDbFeaturesAbsent,
	expectDbFeaturesCorrect,
} from "../utils/expectCatalogFeatures.js";
import { expectDbCreditSchemaCorrect } from "../utils/expectCatalogSideEffects.js";
import { uniqueTestId } from "../utils/uniqueTestId.js";

const meteredFeature = (featureId: string, consumable: boolean) => ({
	feature_id: featureId,
	name: "CatalogV2 Ordering Feature",
	type: FeatureType.Metered,
	consumable,
});

const booleanFeature = (featureId: string) => ({
	feature_id: featureId,
	name: "CatalogV2 Ordering Feature",
	type: FeatureType.Boolean,
});

const creditSystemFeature = ({
	featureId,
	meteredFeatureIds,
}: {
	featureId: string;
	meteredFeatureIds: string[];
}) => ({
	feature_id: featureId,
	name: "CatalogV2 Ordering Credits",
	type: FeatureType.CreditSystem,
	credit_schema: meteredFeatureIds.map((meteredFeatureId) => ({
		metered_feature_id: meteredFeatureId,
		credit_cost: 1,
	})),
});

const renameFeature = ({ from, to }: { from: string; to: string }) => ({
	feature_id: from,
	new_feature_id: to,
	name: "CatalogV2 Ordering Feature",
	type: FeatureType.Metered,
	consumable: true,
});

const seedMeteredAndCreditSystem = async ({
	autumn,
	meteredId,
	creditSystemId,
	consumable = true,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	meteredId: string;
	creditSystemId: string;
	consumable?: boolean;
}) => {
	await autumn.catalogV2.update({
		features: [
			meteredFeature(meteredId, consumable),
			creditSystemFeature({
				featureId: creditSystemId,
				meteredFeatureIds: [meteredId],
			}),
		],
	});
};

// ─── CREATE × CREATE ─────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: CREATE consumable + CREATE CS (CS listed first) succeeds via insert sort")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_order_cc_ok_met");
		const creditSystemId = uniqueTestId("cv2_order_cc_ok_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			// CS before metered in the request — insert sort must still apply metered first
			await autumnV2_3.catalogV2.update({
				features: [
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [meteredId],
					}),
					meteredFeature(meteredId, true),
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: meteredId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
					{ id: creditSystemId, type: FeatureType.CreditSystem },
				],
			});
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [meteredId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: CREATE continuous + CREATE CS throws and writes nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_order_cc_bad_met");
		const creditSystemId = uniqueTestId("cv2_order_cc_bad_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await expectAutumnError({
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							meteredFeature(meteredId, false),
							creditSystemFeature({
								featureId: creditSystemId,
								meteredFeatureIds: [meteredId],
							}),
						],
					}),
			});
			await expectDbFeaturesAbsent({ ctx, featureIds });
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

// ─── UPDATE × CREATE ─────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: UPDATE →consumable + CREATE CS sees the feature as updated")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_order_uc_ok_met");
		const creditSystemId = uniqueTestId("cv2_order_uc_ok_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(meteredId, false)],
			});

			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredId, true),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [meteredId],
					}),
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: meteredId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
					{ id: creditSystemId, type: FeatureType.CreditSystem },
				],
			});
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [meteredId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: UPDATE →continuous + CREATE CS throws (self-contradictory) and is atomic")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_order_uc_bad_met");
		const creditSystemId = uniqueTestId("cv2_order_uc_bad_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(meteredId, true)],
			});

			await expectAutumnError({
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							meteredFeature(meteredId, false),
							creditSystemFeature({
								featureId: creditSystemId,
								meteredFeatureIds: [meteredId],
							}),
						],
					}),
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: meteredId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [creditSystemId] });
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

// ─── UPDATE × UPDATE (schema ↔ usage) ───────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: UPDATE →consumable + UPDATE CS to add member succeeds")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const memberId = uniqueTestId("cv2_order_uu_add_mem");
		const otherId = uniqueTestId("cv2_order_uu_add_oth");
		const creditSystemId = uniqueTestId("cv2_order_uu_add_cs");
		const featureIds = [creditSystemId, memberId, otherId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(memberId, false),
					meteredFeature(otherId, true),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [otherId],
					}),
				],
			});

			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(memberId, true),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [otherId, memberId],
					}),
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: memberId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [otherId, memberId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: UPDATE →continuous + UPDATE CS keeping member throws and is atomic")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_order_uu_keep_met");
		const creditSystemId = uniqueTestId("cv2_order_uu_keep_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await seedMeteredAndCreditSystem({
				autumn: autumnV2_3,
				meteredId,
				creditSystemId,
			});

			await expectAutumnError({
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							meteredFeature(meteredId, false),
							creditSystemFeature({
								featureId: creditSystemId,
								meteredFeatureIds: [meteredId],
							}),
						],
					}),
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: meteredId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [meteredId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: UPDATE CS drop member unblocks UPDATE →continuous in the same call")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const droppedId = uniqueTestId("cv2_order_uu_drop_met");
		const keptId = uniqueTestId("cv2_order_uu_drop_kept");
		const creditSystemId = uniqueTestId("cv2_order_uu_drop_cs");
		const featureIds = [creditSystemId, droppedId, keptId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(droppedId, true),
					meteredFeature(keptId, true),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [droppedId, keptId],
					}),
				],
			});

			await expectAutumnError({
				errMessage: `used in credit system ${creditSystemId}`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [meteredFeature(droppedId, false)],
					}),
			});

			// Dropping the schema ref projects the member free — flip is allowed
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(droppedId, false),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [keptId],
					}),
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: droppedId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Continuous,
					},
					{
						id: keptId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [keptId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

// ─── REMOVE × UPDATE ─────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: REMOVE CS unblocks UPDATE →continuous; CS hard-deletes")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_order_ru_usage_met");
		const creditSystemId = uniqueTestId("cv2_order_ru_usage_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await seedMeteredAndCreditSystem({
				autumn: autumnV2_3,
				meteredId,
				creditSystemId,
			});

			await expectAutumnError({
				errMessage: `used in credit system ${creditSystemId}`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [meteredFeature(meteredId, false)],
					}),
			});

			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(meteredId, false)],
				remove_features: [{ feature_id: creditSystemId }],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: meteredId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Continuous,
					},
				],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [creditSystemId] });
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: REMOVE CS unblocks metered→boolean type change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_order_ru_type_met");
		const creditSystemId = uniqueTestId("cv2_order_ru_type_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await seedMeteredAndCreditSystem({
				autumn: autumnV2_3,
				meteredId,
				creditSystemId,
			});

			await expectAutumnError({
				errMessage: "used in a credit system",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [booleanFeature(meteredId)],
					}),
			});

			await autumnV2_3.catalogV2.update({
				features: [booleanFeature(meteredId)],
				remove_features: [{ feature_id: creditSystemId }],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: meteredId, type: FeatureType.Boolean }],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [creditSystemId] });
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

// ─── CREATE × UPDATE (new member on existing CS) ─────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: CREATE consumable + UPDATE CS to add it succeeds (execute insert→update)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const existingId = uniqueTestId("cv2_order_cu_exist");
		const createdId = uniqueTestId("cv2_order_cu_new");
		const creditSystemId = uniqueTestId("cv2_order_cu_cs");
		const featureIds = [creditSystemId, existingId, createdId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(existingId, true),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [existingId],
					}),
				],
			});

			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(createdId, true),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [existingId, createdId],
					}),
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: createdId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [existingId, createdId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: CREATE continuous + UPDATE CS to add it throws and is atomic")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const existingId = uniqueTestId("cv2_order_cu_bad_exist");
		const createdId = uniqueTestId("cv2_order_cu_bad_new");
		const creditSystemId = uniqueTestId("cv2_order_cu_bad_cs");
		const featureIds = [creditSystemId, existingId, createdId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(existingId, true),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [existingId],
					}),
				],
			});

			await expectAutumnError({
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							meteredFeature(createdId, false),
							creditSystemFeature({
								featureId: creditSystemId,
								meteredFeatureIds: [existingId, createdId],
							}),
						],
					}),
			});

			await expectDbFeaturesAbsent({ ctx, featureIds: [createdId] });
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [existingId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

// ─── RENAME × CREATE ─────────────────────────────────────────────────────────

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: RENAME A→B + CREATE CS on B uses the projected id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const oldId = uniqueTestId("cv2_order_rn_ok_old");
		const newId = uniqueTestId("cv2_order_rn_ok_new");
		const creditSystemId = uniqueTestId("cv2_order_rn_ok_cs");
		const featureIds = [creditSystemId, oldId, newId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(oldId, true)],
			});

			await autumnV2_3.catalogV2.update({
				features: [
					renameFeature({ from: oldId, to: newId }),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [newId],
					}),
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: newId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
					{ id: creditSystemId, type: FeatureType.CreditSystem },
				],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [oldId] });
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [newId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 ordering: RENAME A→B + CREATE CS (CS listed first) still binds to projected B")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const oldId = uniqueTestId("cv2_order_rn_sort_old");
		const newId = uniqueTestId("cv2_order_rn_sort_new");
		const creditSystemId = uniqueTestId("cv2_order_rn_sort_cs");
		const featureIds = [creditSystemId, oldId, newId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(oldId, true)],
			});

			// CS before rename in the request — fold still projects B before insert validates
			await autumnV2_3.catalogV2.update({
				features: [
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [newId],
					}),
					renameFeature({ from: oldId, to: newId }),
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: newId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
					{ id: creditSystemId, type: FeatureType.CreditSystem },
				],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [oldId] });
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [newId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
