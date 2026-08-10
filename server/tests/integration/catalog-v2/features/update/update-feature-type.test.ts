/**
 * catalogV2.update / preview_update — changing a feature's type.
 *
 * Contract: boolean↔metered flips are allowed when only products reference
 * the feature, and CONVERT the entitlement rows (boolean→metered: unlimited
 * allowance, lifetime interval; metered→boolean: allowance and entity scoping
 * stripped). The change throws when the feature has customer history, scopes
 * an entity item, or carries a usage price. Switching to or from
 * credit_system always throws, and a metered feature referenced by a credit
 * system's schema cannot change type at all.
 */

import { test } from "bun:test";
import {
	AllowanceType,
	type AttachParamsV1Input,
	EntInterval,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import {
	deleteDbFeatures,
	expectDbFeaturesCorrect,
} from "../../utils/expectCatalogFeatures.js";
import {
	expectDbEntitlementsCorrect,
	expectDbPricesCorrect,
} from "../../utils/expectCatalogSideEffects.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const booleanFeature = (featureId: string) => ({
	feature_id: featureId,
	name: "CatalogV2 Type Feature",
	type: FeatureType.Boolean,
});

const meteredFeature = (featureId: string, consumable = true) => ({
	feature_id: featureId,
	name: "CatalogV2 Type Feature",
	type: FeatureType.Metered,
	consumable,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 change feature type: boolean↔metered flips convert the entitlement rows")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const boolId = uniqueTestId("cv2_type_bool");
		const meteredId = uniqueTestId("cv2_type_met");
		const featureIds = [boolId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		const product = products.pro({
			id: uniqueTestId("cv2_type_flip_pro"),
			items: [
				constructFeatureItem({ featureId: boolId, isBoolean: true }),
				items.free({ featureId: meteredId, includedUsage: 100 }),
			],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [booleanFeature(boolId), meteredFeature(meteredId, false)],
			});
			await initProductsV0({ ctx, products: [product] });

			// boolean → metered: entitlements become unlimited lifetime
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [meteredFeature(boolId)],
				}),
				features: [
					{
						featureId: boolId,
						action: "update",
						hasCustomerEntitlements: false,
						previousAttributes: {
							type: FeatureType.Boolean,
							consumable: false,
						},
					},
				],
			});
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [meteredFeature(boolId)],
				}),
				features: [{ id: boolId, action: "update" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: boolId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
			await expectDbEntitlementsCorrect({
				ctx,
				featureId: boolId,
				expected: {
					allowanceType: AllowanceType.Unlimited,
					interval: EntInterval.Lifetime,
				},
			});

			// metered → boolean: allowance and entity scoping stripped
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [booleanFeature(meteredId)],
				}),
				features: [{ id: meteredId, action: "update" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: meteredId, type: FeatureType.Boolean }],
			});
			await expectDbEntitlementsCorrect({
				ctx,
				featureId: meteredId,
				expected: {
					allowanceType: null,
					interval: null,
					entityFeatureId: null,
				},
			});
		} finally {
			await autumnV2_3.products.delete(product.id).catch(() => {});
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 change feature type: customers, entity scoping and usage prices block")}`,
	async () => {
		const attachedId = uniqueTestId("cv2_type_cust");
		const entityId = uniqueTestId("cv2_type_entity");
		const scopedId = uniqueTestId("cv2_type_scoped");
		const pricedId = uniqueTestId("cv2_type_priced");
		const featureIds = [attachedId, entityId, scopedId, pricedId];

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: uniqueTestId("cv2-type-cust"),
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		await deleteDbFeatures({ ctx, featureIds });

		const attachedProduct = products.pro({
			id: uniqueTestId("cv2_type_cust_pro"),
			items: [items.free({ featureId: attachedId, includedUsage: 100 })],
		});
		const entityProduct = products.base({
			id: uniqueTestId("cv2_type_entity_pro"),
			items: [
				items.free({
					featureId: scopedId,
					includedUsage: 100,
					entityFeatureId: entityId,
				}),
			],
		});
		const pricedProduct = products.base({
			id: uniqueTestId("cv2_type_priced_pro"),
			items: [items.consumable({ featureId: pricedId })],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(attachedId),
					meteredFeature(entityId, false),
					meteredFeature(scopedId),
					meteredFeature(pricedId),
				],
			});
			await initProductsV0({
				ctx,
				products: [attachedProduct, entityProduct, pricedProduct],
			});
			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: attachedProduct.id,
			});

			await expectAutumnError({
				errMessage: `Cannot change type of feature ${attachedId} because it has been attached to a customer`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [booleanFeature(attachedId)],
					}),
			});

			// Expired customer products still count as customer history
			await autumnV2_3.cancel({
				customer_id: customerId,
				product_id: attachedProduct.id,
				cancel_immediately: true,
			});
			await expectAutumnError({
				errMessage: `Cannot change type of feature ${attachedId} because it has been attached to a customer`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [booleanFeature(attachedId)],
					}),
			});
			await expectAutumnError({
				errMessage: `Cannot change type of feature ${entityId} because it is used in an entity feature`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [booleanFeature(entityId)],
					}),
			});
			await expectAutumnError({
				errMessage: `Cannot change type of feature ${pricedId} because it has a usage price`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [booleanFeature(pricedId)],
					}),
			});

			// Nothing changed
			await expectDbFeaturesCorrect({
				ctx,
				expected: featureIds.map((id) => ({ id, type: FeatureType.Metered })),
			});
			await expectDbPricesCorrect({
				ctx,
				featureId: pricedId,
				expected: { count: 1 },
			});
		} finally {
			for (const product of [attachedProduct, entityProduct, pricedProduct]) {
				await autumnV2_3.products.delete(product.id).catch(() => {});
			}
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 change feature type: credit system switches and schema membership block")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_type_cs_met");
		const plainId = uniqueTestId("cv2_type_cs_plain");
		const creditSystemId = uniqueTestId("cv2_type_cs");
		const featureIds = [creditSystemId, meteredId, plainId];
		await deleteDbFeatures({ ctx, featureIds });

		const creditSystemEntry = {
			feature_id: creditSystemId,
			name: "CatalogV2 Type Credits",
			type: FeatureType.CreditSystem,
			credit_schema: [{ metered_feature_id: meteredId, credit_cost: 2 }],
		};

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredId),
					meteredFeature(plainId),
					creditSystemEntry,
				],
			});

			// metered → credit_system: blocked even with zero references
			await expectAutumnError({
				errMessage: `Cannot change type of feature ${plainId} from metered to credit_system`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							{
								...creditSystemEntry,
								feature_id: plainId,
								name: "CatalogV2 Type Feature",
							},
						],
					}),
			});

			// credit_system → metered: blocked
			await expectAutumnError({
				errMessage: `Cannot change type of feature ${creditSystemId} from credit_system to metered`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [meteredFeature(creditSystemId)],
					}),
			});

			// metered referenced by a credit system schema: blocked
			await expectAutumnError({
				errMessage: `Cannot change type of feature ${meteredId} because it is used in a credit system`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [booleanFeature(meteredId)],
					}),
			});

			// credit_system → ai_credit_system is still a credit-system switch
			await expectAutumnError({
				errMessage: `Cannot change type of feature ${creditSystemId} from credit_system to ai_credit_system`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							{
								feature_id: creditSystemId,
								name: "CatalogV2 Type Credits",
								type: FeatureType.AiCreditSystem,
								default_markup: 50,
							},
						],
					}),
			});

			// metered → ai_credit_system is NOT a classic credit-system switch —
			// allowed while nothing references the feature
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [
						{
							feature_id: plainId,
							name: "CatalogV2 Type Feature",
							type: FeatureType.AiCreditSystem,
							default_markup: 50,
						},
					],
				}),
				features: [{ featureId: plainId, action: "update" }],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
