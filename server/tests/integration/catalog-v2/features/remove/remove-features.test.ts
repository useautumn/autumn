/**
 * catalogV2.update / preview_update — remove_features verdicts.
 *
 * Contract: a removed feature is HARD DELETED when nothing references it
 * after the batch, and ARCHIVED when any reference survives — customer
 * entitlement history (expired customer products included), entitlements on
 * any product (archived products included), usage prices, or a persisted
 * credit system schema. Verdicts are projected against the batch: removing a
 * credit system and its metered feature in one call hard-deletes both, a
 * same-call CS insert/update that KEEPS referencing a removed feature archives
 * it (never a 400 — atmn/V1 parity), and one that DROPS the reference frees it
 * for hard delete. Preview reports action "delete" with the will_archive
 * verdict and writes nothing.
 */

import { test } from "bun:test";
import { type AttachParamsV1Input, FeatureType } from "@autumn/shared";
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
	archiveDbFeature,
	expectDbCreditSchemaCorrect,
	expectDbFeatureArchived,
} from "../../utils/expectCatalogSideEffects.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const meteredFeature = (featureId: string) => ({
	feature_id: featureId,
	name: "CatalogV2 Remove Feature",
	type: FeatureType.Metered,
	consumable: true,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove features: unreferenced features hard delete, archived or not")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const plainId = uniqueTestId("cv2_rm_plain");
		const archivedId = uniqueTestId("cv2_rm_archived");
		const featureIds = [plainId, archivedId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(plainId), meteredFeature(archivedId)],
			});
			await archiveDbFeature({ ctx, featureId: archivedId });

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_features: [
						{ feature_id: plainId },
						{ feature_id: archivedId },
					],
				}),
				features: [
					{
						featureId: plainId,
						action: "delete",
						hasCustomerEntitlements: false,
						willArchive: false,
					},
					{
						featureId: archivedId,
						action: "delete",
						hasCustomerEntitlements: false,
						willArchive: false,
					},
				],
			});
			// Preview wrote nothing
			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: plainId, type: FeatureType.Metered }],
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					remove_features: [
						{ feature_id: plainId },
						{ feature_id: archivedId },
					],
				}),
				features: [
					{ id: plainId, action: "delete" },
					{ id: archivedId, action: "delete" },
				],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds });
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove features: product, price and credit-system references archive instead")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const onProductId = uniqueTestId("cv2_rm_on_product");
		const onArchivedProductId = uniqueTestId("cv2_rm_on_archived_product");
		const pricedId = uniqueTestId("cv2_rm_priced");
		const inCreditSystemId = uniqueTestId("cv2_rm_in_cs");
		const creditSystemId = uniqueTestId("cv2_rm_cs_keeper");
		const entityId = uniqueTestId("cv2_rm_entity");
		const scopedId = uniqueTestId("cv2_rm_scoped");
		const featureIds = [
			onProductId,
			onArchivedProductId,
			pricedId,
			inCreditSystemId,
			creditSystemId,
			entityId,
			scopedId,
		];
		await deleteDbFeatures({ ctx, featureIds });

		const activeProduct = products.base({
			id: uniqueTestId("cv2_rm_active_pro"),
			items: [
				items.free({ featureId: onProductId, includedUsage: 100 }),
				items.consumable({ featureId: pricedId }),
				items.free({
					featureId: scopedId,
					includedUsage: 100,
					entityFeatureId: entityId,
				}),
			],
		});
		const archivedProduct = products.base({
			id: uniqueTestId("cv2_rm_archived_pro"),
			items: [
				items.free({ featureId: onArchivedProductId, includedUsage: 50 }),
			],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(onProductId),
					meteredFeature(onArchivedProductId),
					meteredFeature(pricedId),
					meteredFeature(inCreditSystemId),
					{ ...meteredFeature(entityId), consumable: false },
					meteredFeature(scopedId),
					{
						feature_id: creditSystemId,
						name: "CatalogV2 Remove Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: inCreditSystemId, credit_cost: 1 },
						],
					},
				],
			});
			await initProductsV0({ ctx, products: [activeProduct, archivedProduct] });
			await autumnV2_3.products.update(archivedProduct.id, { archived: true });

			// Referenced four different ways: product entitlement (active and
			// archived product), usage price, credit-system schema, entity scoping.
			const removeFeatureIds = [
				onProductId,
				onArchivedProductId,
				pricedId,
				inCreditSystemId,
				entityId,
			];
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_features: removeFeatureIds.map((id) => ({ feature_id: id })),
				}),
				features: removeFeatureIds.map((featureId) => ({
					featureId,
					action: "delete" as const,
					hasCustomerEntitlements: false,
					willArchive: true,
				})),
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					remove_features: removeFeatureIds.map((id) => ({ feature_id: id })),
				}),
				features: removeFeatureIds.map((id) => ({
					id,
					action: "delete" as const,
				})),
			});
			for (const featureId of removeFeatureIds) {
				await expectDbFeatureArchived({ ctx, featureId });
			}
		} finally {
			for (const product of [activeProduct, archivedProduct]) {
				await autumnV2_3.products.delete(product.id).catch(() => {});
			}
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove features: customer history archives — expired customer products included")}`,
	async () => {
		const featureId = uniqueTestId("cv2_rm_cust");

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: uniqueTestId("cv2-rm-cust"),
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		const attachedProduct = products.pro({
			id: uniqueTestId("cv2_rm_cust_pro"),
			items: [items.free({ featureId, includedUsage: 100 })],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(featureId)],
			});
			await initProductsV0({ ctx, products: [attachedProduct] });
			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: attachedProduct.id,
			});

			// Expire the customer product — history still archives
			await autumnV2_3.cancel({
				customer_id: customerId,
				product_id: attachedProduct.id,
				cancel_immediately: true,
			});

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_features: [{ feature_id: featureId }],
				}),
				features: [
					{
						featureId,
						action: "delete",
						hasCustomerEntitlements: true,
						willArchive: true,
					},
				],
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					remove_features: [{ feature_id: featureId }],
				}),
				features: [{ id: featureId, action: "delete" }],
			});
			await expectDbFeatureArchived({ ctx, featureId });
		} finally {
			await autumnV2_3.products.delete(attachedProduct.id).catch(() => {});
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove features: removing a credit system and its metered feature together hard-deletes both")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_rm_both_met");
		const creditSystemId = uniqueTestId("cv2_rm_both_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredId),
					{
						feature_id: creditSystemId,
						name: "CatalogV2 Remove Both Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [{ metered_feature_id: meteredId, credit_cost: 1 }],
					},
				],
			});

			// Alone, the metered feature would only archive (schema references it)
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_features: [{ feature_id: meteredId }],
				}),
				features: [
					{ featureId: meteredId, action: "delete", willArchive: true },
				],
			});

			// Together, the reference leaves with the batch — both hard delete
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_features: [
						{ feature_id: creditSystemId },
						{ feature_id: meteredId },
					],
				}),
				features: [
					{ featureId: creditSystemId, action: "delete", willArchive: false },
					{ featureId: meteredId, action: "delete", willArchive: false },
				],
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					remove_features: [
						{ feature_id: creditSystemId },
						{ feature_id: meteredId },
					],
				}),
				features: [
					{ id: creditSystemId, action: "delete" },
					{ id: meteredId, action: "delete" },
				],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds });
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove features: same-call credit system schemas decide archive vs hard delete")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const keptByInsertId = uniqueTestId("cv2_rm_kept_by_insert");
		const keptByUpdateId = uniqueTestId("cv2_rm_kept_by_update");
		const droppedId = uniqueTestId("cv2_rm_dropped_from_schema");
		const insertedCreditSystemId = uniqueTestId("cv2_rm_same_call_new_cs");
		const existingCreditSystemId = uniqueTestId("cv2_rm_same_call_old_cs");
		const featureIds = [
			insertedCreditSystemId,
			existingCreditSystemId,
			keptByInsertId,
			keptByUpdateId,
			droppedId,
		];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(keptByInsertId),
					meteredFeature(keptByUpdateId),
					meteredFeature(droppedId),
					{
						feature_id: existingCreditSystemId,
						name: "CatalogV2 Remove Same-Call Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: keptByUpdateId, credit_cost: 1 },
							{ metered_feature_id: droppedId, credit_cost: 1 },
						],
					},
				],
			});

			// One call: a NEW credit system references one removed feature, an
			// EXISTING credit system keeps one removed member and drops another.
			// Upserts land before removals, so kept references archive and the
			// dropped reference frees its feature for hard delete.
			const sameCallParams = {
				features: [
					{
						feature_id: insertedCreditSystemId,
						name: "CatalogV2 Remove Same-Call Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: keptByInsertId, credit_cost: 1 },
						],
					},
					{
						feature_id: existingCreditSystemId,
						name: "CatalogV2 Remove Same-Call Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: keptByUpdateId, credit_cost: 1 },
						],
					},
				],
				remove_features: [
					{ feature_id: keptByInsertId },
					{ feature_id: keptByUpdateId },
					{ feature_id: droppedId },
				],
			};

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate(sameCallParams),
				features: [
					{ featureId: insertedCreditSystemId, action: "create" },
					{ featureId: existingCreditSystemId, action: "update" },
					{ featureId: keptByInsertId, action: "delete", willArchive: true },
					{ featureId: keptByUpdateId, action: "delete", willArchive: true },
					{ featureId: droppedId, action: "delete", willArchive: false },
				],
			});

			await autumnV2_3.catalogV2.update(sameCallParams);

			await expectDbFeatureArchived({ ctx, featureId: keptByInsertId });
			await expectDbFeatureArchived({ ctx, featureId: keptByUpdateId });
			await expectDbFeaturesAbsent({ ctx, featureIds: [droppedId] });
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId: insertedCreditSystemId,
				meteredFeatureIds: [keptByInsertId],
			});
			await expectDbCreditSchemaCorrect({
				ctx,
				creditSystemId: existingCreditSystemId,
				meteredFeatureIds: [keptByUpdateId],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
