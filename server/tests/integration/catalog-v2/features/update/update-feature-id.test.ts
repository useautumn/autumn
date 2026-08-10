/**
 * catalogV2.update / preview_update — renaming a feature id.
 *
 * Contract: a features[] entry may carry new_feature_id. The rename applies
 * only when no customer entitlement has EVER referenced the feature (any
 * status, expired included) and the target id is free in the PROJECTED
 * catalog — persisted ids and ids inserted by the same call both collide.
 * Product references (active and archived) follow the rename. Preview
 * reports action "update" + previous_attributes and throws the same errors.
 */

import { test } from "bun:test";
import { type AttachParamsV1Input, FeatureType } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import {
	deleteDbFeatures,
	expectDbFeaturesAbsent,
	expectDbFeaturesCorrect,
} from "../../utils/expectCatalogFeatures.js";
import {
	expectDbCreditSchemaCorrect,
	expectDbEntitlementsCorrect,
	expectDbPricesCorrect,
} from "../../utils/expectCatalogSideEffects.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
	expectPlanFeatureIdsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const consumableFeature = (featureId: string) => ({
	feature_id: featureId,
	name: "CatalogV2 Update Feature",
	type: FeatureType.Metered,
	consumable: true,
});

const renameFeature = ({ from, to }: { from: string; to: string }) => ({
	...consumableFeature(from),
	new_feature_id: to,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename feature: references on active + archived products follow, no-op reports none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const oldId = uniqueTestId("cv2_rename_clean_old");
		const newId = uniqueTestId("cv2_rename_clean_new");
		const creditSystemId = uniqueTestId("cv2_rename_clean_cs");
		const featureIds = [creditSystemId, oldId, newId];
		await deleteDbFeatures({ ctx, featureIds });

		// One item carrying both an entitlement and a usage price on the feature
		const activeProduct = products.pro({
			id: uniqueTestId("cv2_rename_clean_active"),
			items: [items.consumable({ featureId: oldId, includedUsage: 100 })],
		});
		const archivedProduct = products.pro({
			id: uniqueTestId("cv2_rename_clean_archived"),
			items: [items.free({ featureId: oldId, includedUsage: 50 })],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					consumableFeature(oldId),
					{
						feature_id: creditSystemId,
						name: "CatalogV2 Rename Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [{ metered_feature_id: oldId, credit_cost: 1 }],
					},
				],
			});
			await initProductsV0({ ctx, products: [activeProduct, archivedProduct] });
			await autumnV2_3.products.update(archivedProduct.id, { archived: true });

			// Preview reports the rename without writing
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [renameFeature({ from: oldId, to: newId })],
				}),
				features: [
					{
						featureId: newId,
						action: "update",
						hasCustomerEntitlements: false,
						previousAttributes: { id: oldId },
					},
				],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [newId] });

			// Apply: old id gone, new id present, product items follow
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [renameFeature({ from: oldId, to: newId })],
				}),
				features: [{ id: newId, action: "update" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: newId, type: FeatureType.Metered }],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [oldId] });
			for (const product of [activeProduct, archivedProduct]) {
				await expectPlanFeatureIdsCorrect({
					autumn: autumnV2_3,
					planId: product.id,
					featureIds: [newId],
				});
			}
			// Price configs and credit-system schemas follow the rename too
			await expectDbPricesCorrect({
				ctx,
				featureId: newId,
				expected: { configFeatureId: newId },
			});
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId,
				meteredFeatureIds: [newId],
			});

			// Identical entry again → nothing to change, action "none"
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [consumableFeature(newId)],
				}),
				features: [{ id: newId, action: "none" }],
			});
		} finally {
			for (const product of [activeProduct, archivedProduct]) {
				await autumnV2_3.products.delete(product.id).catch(() => {});
			}
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename feature: target id taken — persisted or inserted in the same call — throws and writes nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureAId = uniqueTestId("cv2_rename_conflict_a");
		const featureBId = uniqueTestId("cv2_rename_conflict_b");
		const insertedId = uniqueTestId("cv2_rename_conflict_inserted");
		const featureIds = [featureAId, featureBId, insertedId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					consumableFeature(featureAId),
					consumableFeature(featureBId),
				],
			});

			// Target id already persisted
			await expectAutumnError({
				errCode: "duplicate_feature_id",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [renameFeature({ from: featureAId, to: featureBId })],
					}),
			});

			// Target id inserted by the SAME call — the projected catalog collides
			await expectAutumnError({
				errCode: "duplicate_feature_id",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							consumableFeature(insertedId),
							renameFeature({ from: featureAId, to: insertedId }),
						],
					}),
			});

			// Preview throws identically
			await expectAutumnError({
				errCode: "duplicate_feature_id",
				func: () =>
					autumnV2_3.catalogV2.previewUpdate({
						features: [renameFeature({ from: featureAId, to: featureBId })],
					}),
			});

			// Swapping two ids in one call is order-dependent — blocked
			await expectAutumnError({
				errCode: "duplicate_feature_id",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							renameFeature({ from: featureAId, to: featureBId }),
							renameFeature({ from: featureBId, to: featureAId }),
						],
					}),
			});

			// The whole batch failed before any write: A intact, insert absent
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{ id: featureAId, type: FeatureType.Metered },
					{ id: featureBId, type: FeatureType.Metered },
				],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [insertedId] });
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename feature: customer entitlements block — active and expired customer products")}`,
	async () => {
		const oldId = uniqueTestId("cv2_rename_cust_old");
		const newId = uniqueTestId("cv2_rename_cust_new");
		const featureIds = [oldId, newId];

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: uniqueTestId("cv2-rename-cust"),
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		await deleteDbFeatures({ ctx, featureIds });

		const attachedProduct = products.pro({
			id: uniqueTestId("cv2_rename_cust_pro"),
			items: [items.free({ featureId: oldId, includedUsage: 100 })],
		});

		const expectRenameBlocked = () =>
			expectAutumnError({
				errMessage: `Cannot change id of feature ${oldId}`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [renameFeature({ from: oldId, to: newId })],
					}),
			});

		try {
			await autumnV2_3.catalogV2.update({
				features: [consumableFeature(oldId)],
			});
			await initProductsV0({ ctx, products: [attachedProduct] });
			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: attachedProduct.id,
			});

			// Active customer product → blocked
			await expectRenameBlocked();

			// Expired customer product → still blocked (history counts)
			await autumnV2_3.cancel({
				customer_id: customerId,
				product_id: attachedProduct.id,
				cancel_immediately: true,
			});
			await expectRenameBlocked();

			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: oldId, type: FeatureType.Metered }],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [newId] });
		} finally {
			await autumnV2_3.products.delete(attachedProduct.id).catch(() => {});
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename feature: entity-scoped items follow the entity feature's new id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const entityOldId = uniqueTestId("cv2_rename_entity_old");
		const entityNewId = uniqueTestId("cv2_rename_entity_new");
		const scopedId = uniqueTestId("cv2_rename_entity_scoped");
		const featureIds = [entityOldId, entityNewId, scopedId];
		await deleteDbFeatures({ ctx, featureIds });

		const product = products.base({
			id: uniqueTestId("cv2_rename_entity_pro"),
			items: [
				items.free({
					featureId: scopedId,
					includedUsage: 100,
					entityFeatureId: entityOldId,
				}),
			],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{ ...consumableFeature(entityOldId), consumable: false },
					consumableFeature(scopedId),
				],
			});
			await initProductsV0({ ctx, products: [product] });

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [
						{
							...renameFeature({ from: entityOldId, to: entityNewId }),
							consumable: false,
						},
					],
				}),
				features: [{ id: entityNewId, action: "update" }],
			});

			await expectDbEntitlementsCorrect({
				ctx,
				featureId: scopedId,
				expected: { entityFeatureId: entityNewId },
			});
		} finally {
			await autumnV2_3.products.delete(product.id).catch(() => {});
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
