/**
 * catalogV2.update / preview_update — flipping consumable (usage type).
 *
 * Contract: the flip is allowed when only products reference the feature and
 * RESHAPES the referencing rows — entitlements get a lifetime interval when
 * going continuous, usage prices flip should_prorate and drop their Stripe
 * price. It throws when the feature is in a credit system's schema, scopes an
 * entity item, or has customer history.
 */

import { test } from "bun:test";
import {
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

const meteredFeature = (featureId: string, consumable: boolean) => ({
	feature_id: featureId,
	name: "CatalogV2 Usage Feature",
	type: FeatureType.Metered,
	consumable,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 flip consumable: entitlement intervals and price configs are reshaped")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_usage_flip");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		const product = products.base({
			id: uniqueTestId("cv2_usage_flip_pro"),
			items: [items.consumable({ featureId })],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(featureId, true)],
			});
			await initProductsV0({ ctx, products: [product] });

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [meteredFeature(featureId, false)],
				}),
				features: [
					{
						featureId,
						action: "update",
						hasCustomerEntitlements: false,
						previousAttributes: { consumable: true },
					},
				],
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [meteredFeature(featureId, false)],
				}),
				features: [{ id: featureId, action: "update" }],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: featureId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Continuous,
					},
				],
			});
			await expectDbEntitlementsCorrect({
				ctx,
				featureId,
				expected: { interval: EntInterval.Lifetime },
			});
			await expectDbPricesCorrect({
				ctx,
				featureId,
				expected: { shouldProrate: true, stripePriceId: null },
			});

			// Flip back: prices return to non-prorating consumable shape
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [meteredFeature(featureId, true)],
				}),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { consumable: false },
					},
				],
			});
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [meteredFeature(featureId, true)],
				}),
				features: [{ id: featureId, action: "update" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: featureId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
			await expectDbPricesCorrect({
				ctx,
				featureId,
				expected: { shouldProrate: false, stripePriceId: null },
			});
		} finally {
			await autumnV2_3.products.delete(product.id).catch(() => {});
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 flip consumable: credit systems, entity scoping and customers block")}`,
	async () => {
		const inCreditSystemId = uniqueTestId("cv2_usage_cs_met");
		const creditSystemId = uniqueTestId("cv2_usage_cs");
		const entityId = uniqueTestId("cv2_usage_entity");
		const scopedId = uniqueTestId("cv2_usage_scoped");
		const attachedId = uniqueTestId("cv2_usage_cust");
		const featureIds = [
			creditSystemId,
			inCreditSystemId,
			entityId,
			scopedId,
			attachedId,
		];

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: uniqueTestId("cv2-usage-cust"),
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		await deleteDbFeatures({ ctx, featureIds });

		const entityProduct = products.base({
			id: uniqueTestId("cv2_usage_entity_pro"),
			items: [
				items.free({
					featureId: scopedId,
					includedUsage: 100,
					entityFeatureId: entityId,
				}),
			],
		});
		const attachedProduct = products.pro({
			id: uniqueTestId("cv2_usage_cust_pro"),
			items: [items.free({ featureId: attachedId, includedUsage: 100 })],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(inCreditSystemId, true),
					meteredFeature(entityId, false),
					meteredFeature(scopedId, true),
					meteredFeature(attachedId, true),
					{
						feature_id: creditSystemId,
						name: "CatalogV2 Usage Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: inCreditSystemId, credit_cost: 1 },
						],
					},
				],
			});
			await initProductsV0({ ctx, products: [entityProduct, attachedProduct] });
			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: attachedProduct.id,
			});

			await expectAutumnError({
				errMessage: `used in credit system ${creditSystemId}`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [meteredFeature(inCreditSystemId, false)],
					}),
			});
			await expectAutumnError({
				errMessage: "used as an entity",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [meteredFeature(entityId, true)],
					}),
			});
			await expectAutumnError({
				errMessage: "used by customers",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [meteredFeature(attachedId, false)],
					}),
			});

			// Nothing changed
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: inCreditSystemId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
					{
						id: entityId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Continuous,
					},
					{
						id: attachedId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
		} finally {
			for (const product of [entityProduct, attachedProduct]) {
				await autumnV2_3.products.delete(product.id).catch(() => {});
			}
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
