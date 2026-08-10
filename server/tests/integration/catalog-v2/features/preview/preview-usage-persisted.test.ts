/**
 * catalogV2.preview_update — persisted plan/customer usage buckets + reasons.
 */

import { test } from "bun:test";
import { type AttachParamsV1Input, FeatureType } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { deleteDbFeatures } from "../../utils/expectCatalogFeatures.js";
import { expectCatalogPreviewCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const meteredFeature = (featureId: string) => ({
	feature_id: featureId,
	name: "CatalogV2 Preview Usage Feature",
	type: FeatureType.Metered,
	consumable: true,
});

const renameFeature = ({ from, to }: { from: string; to: string }) => ({
	...meteredFeature(from),
	new_feature_id: to,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: plan + credit-system usage become reason messages")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_rm_usage_met");
		const creditSystemId = uniqueTestId("cv2_rm_usage_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		const plan = products.base({
			id: uniqueTestId("cv2_rm_usage_pro"),
			items: [items.free({ featureId: meteredId, includedUsage: 100 })],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredId),
					{
						feature_id: creditSystemId,
						name: "CatalogV2 Preview Usage Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: meteredId, credit_cost: 1 },
						],
					},
				],
			});
			await initProductsV0({ ctx, products: [plan] });

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_features: [{ feature_id: meteredId }],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId: meteredId,
						action: "delete",
						willArchive: true,
						usage: {
							plans: { count: 1, sampleIds: [plan.id] },
							creditSystems: { count: 1, sampleIds: [creditSystemId] },
						},
						reasonMessages: [
							`Plan "${plan.name ?? plan.id}" is using this feature.`,
							`Credit system "CatalogV2 Preview Usage Credits" references this feature.`,
						],
					},
				],
			});
		} finally {
			await autumnV2_3.products.delete(plan.id).catch(() => {});
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: unreferenced feature has empty reasons and will_archive false")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_rm_usage_clean");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(featureId)],
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_features: [{ feature_id: featureId }],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId,
						action: "delete",
						willArchive: false,
						usage: { plans: { count: 0 } },
						reasonMessages: [],
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: plans usage caps at 3 with 2 samples and capped reason")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_prev_plans_cap");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		const plans = Array.from({ length: 5 }, (_, index) =>
			products.base({
				id: uniqueTestId(`cv2_prev_plans_cap_p${index}`),
				items: [items.free({ featureId, includedUsage: 100 })],
			}),
		);

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(featureId)],
			});
			await initProductsV0({ ctx, products: plans });

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_features: [{ feature_id: featureId }],
			});

			const firstPlanName = preview.features.find(
				(f) => f.feature_id === featureId,
			)?.state.usage.plans.samples[0]?.name;

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId,
						action: "delete",
						willArchive: true,
						usage: {
							plans: { count: 3, countCapped: true, sampleCount: 2 },
						},
						reasonsInclude: [
							`Plans "${firstPlanName}" and 3+ others are using this feature.`,
						],
					},
				],
			});
		} finally {
			for (const plan of plans) {
				await autumnV2_3.products.delete(plan.id).catch(() => {});
			}
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: customer attach surfaces has_customers and customer reason")}`,
	async () => {
		const featureId = uniqueTestId("cv2_prev_cust");

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: uniqueTestId("cv2-prev-cust"),
			setup: [s.customer({ paymentMethod: "success" })],
			actions: [],
		});
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		const attachedProduct = products.pro({
			id: uniqueTestId("cv2_prev_cust_pro"),
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

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_features: [{ feature_id: featureId }],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId,
						action: "delete",
						hasCustomerEntitlements: true,
						willArchive: true,
						usage: {
							customers: { count: 1, sampleIds: [customerId] },
						},
						reasonsInclude: [`Attached to customer "${customerId}".`],
					},
				],
			});
		} finally {
			await autumnV2_3.products.delete(attachedProduct.id).catch(() => {});
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: standalone balance names the attached customer")}`,
	async () => {
		const featureId = uniqueTestId("cv2_prev_loose");
		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: uniqueTestId("cv2-prev-loose"),
			setup: [s.customer({ testClock: false })],
			actions: [],
		});
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(featureId)],
			});
			await autumnV2_3.balances.create({
				customer_id: customerId,
				feature_id: featureId,
				included_grant: 100,
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_features: [{ feature_id: featureId }],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId,
						action: "delete",
						hasCustomerEntitlements: true,
						willArchive: true,
						usage: {
							plans: { count: 0 },
							customers: { count: 1, sampleIds: [customerId] },
						},
						reasonsInclude: [`Attached to customer "${customerId}".`],
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: two standalone balances name first customer and 1 more")}`,
	async () => {
		const featureId = uniqueTestId("cv2_prev_loose2");
		const otherId = uniqueTestId("cv2-prev-loose2b");
		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: uniqueTestId("cv2-prev-loose2"),
			setup: [
				s.customer({ testClock: false }),
				s.otherCustomers([{ id: otherId }]),
			],
			actions: [],
		});
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(featureId)],
			});
			await autumnV2_3.balances.create({
				customer_id: customerId,
				feature_id: featureId,
				included_grant: 50,
			});
			await autumnV2_3.balances.create({
				customer_id: otherId,
				feature_id: featureId,
				included_grant: 50,
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_features: [{ feature_id: featureId }],
			});

			const firstCustomerName = preview.features.find(
				(feature) => feature.feature_id === featureId,
			)?.state.usage.customers.samples[0]?.name;

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId,
						action: "delete",
						hasCustomerEntitlements: true,
						willArchive: true,
						usage: {
							customers: { count: 2, sampleCount: 2 },
						},
						reasonsInclude: [
							`Attached to customer "${firstCustomerName}" and 1 more.`,
						],
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update preview: rename entry carries plan usage with empty reasons")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const oldId = uniqueTestId("cv2_prev_rename_old");
		const newId = uniqueTestId("cv2_prev_rename_new");
		const featureIds = [oldId, newId];
		await deleteDbFeatures({ ctx, featureIds });

		const plan = products.base({
			id: uniqueTestId("cv2_prev_rename_pro"),
			items: [items.free({ featureId: oldId, includedUsage: 100 })],
		});

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(oldId)],
			});
			await initProductsV0({ ctx, products: [plan] });

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				features: [renameFeature({ from: oldId, to: newId })],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId: newId,
						action: "update",
						previousAttributes: { id: oldId },
						usage: { plans: { count: 1 } },
						reasonMessages: [],
					},
				],
			});
		} finally {
			await autumnV2_3.products.delete(plan.id).catch(() => {});
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
