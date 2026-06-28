import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogPreview } from "./utils/expectCatalogPreview.js";
import { expectFeaturePreviewCorrect } from "./utils/expectFeaturePreviewCorrect.js";

const featureId = (suffix: string) =>
	`catalog_feature_${suffix}_${Math.random().toString(36).slice(2, 9)}`;

const featureToParams = (feature: any) => ({
	feature_id: feature.id,
	name: feature.name,
	type: feature.type,
	consumable: feature.consumable,
	credit_schema: feature.credit_schema,
	model_markups: feature.model_markups,
	default_markup: feature.default_markup,
	provider_markups: feature.provider_markups,
	event_names: feature.event_names,
	...(feature.display?.singular && feature.display?.plural
		? { display: feature.display }
		: {}),
});

const desiredFeaturesWithout = async ({
	autumn,
	featureIds,
}: {
	autumn: { post: (path: string, body: any) => Promise<any> };
	featureIds: string[];
}) => {
	const excluded = new Set(featureIds);
	const list = await autumn.post("/features.list", {});
	return list.list
		.filter((feature: { id: string; archived?: boolean }) => {
			return !feature.archived && !excluded.has(feature.id);
		})
		.map(featureToParams);
};

const desiredPlansWithout = async ({
	autumn,
	planIds,
}: {
	autumn: { post: (path: string, body: any) => Promise<any> };
	planIds: string[];
}) => {
	const excluded = new Set(planIds);
	const list = await autumn.post("/plans.list", {});
	return list.list
		.filter((plan: { id: string }) => !excluded.has(plan.id))
		.map((plan: { id: string }) => ({ plan_id: plan.id }));
};

const listFeatures = async (autumn: {
	post: (path: string, body: any) => Promise<any>;
}) => (await autumn.post("/features.list", {})).list;

const findFeature = async ({
	autumn,
	featureId,
}: {
	autumn: { post: (path: string, body: any) => Promise<any> };
	featureId: string;
}) => {
	const list = await listFeatures(autumn);
	return list.find((feature: { id: string }) => feature.id === featureId);
};

const findPlan = async ({
	autumn,
	includeArchived = false,
	planId,
}: {
	autumn: { post: (path: string, body: any) => Promise<any> };
	includeArchived?: boolean;
	planId: string;
}) => {
	const response = await autumn.post("/plans.list", { include_archived: includeArchived });
	return response.list.find((plan: { id: string }) => plan.id === planId);
};

const createMeteredFeature = (id: string) => ({
	feature_id: id,
	name: id,
	type: FeatureType.Metered,
	consumable: true,
});

const createCreditSystemFeature = ({
	id,
	meteredFeatureId,
}: {
	id: string;
	meteredFeatureId: string;
}) => ({
	feature_id: id,
	name: id,
	type: FeatureType.CreditSystem,
	consumable: true,
	credit_schema: [{ metered_feature_id: meteredFeatureId, credit_cost: 1 }],
});

test(
	`${chalk.yellowBright("catalog preview/update: skip ids prevent feature and plan writes")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const updateFeatureId = featureId(`skip_update_${suffix}`);
		const removeFeatureId = featureId(`skip_remove_${suffix}`);
		const updatePlanId = `catalog_skip_update_${suffix}`;
		const removePlanId = `catalog_skip_remove_${suffix}`;

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-skip-ids-${suffix}`,
			setup: [],
			actions: [],
		});
		await autumnV2_2.post("/features.create", createMeteredFeature(updateFeatureId));
		await autumnV2_2.post("/features.create", createMeteredFeature(removeFeatureId));
		await autumnV2_2.post("/catalog.update", {
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [],
			}),
			plans: [
				{
					plan_id: updatePlanId,
					name: "Skip Update Plan",
					items: [
						{
							feature_id: updateFeatureId,
							included: 100,
							reset: { interval: "month" },
						},
					],
				},
				{
					plan_id: removePlanId,
					name: "Skip Remove Plan",
					items: [
						{
							feature_id: removeFeatureId,
							included: 100,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		const desiredFeatures = [
			...(await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [updateFeatureId, removeFeatureId],
			})),
			{
				feature_id: updateFeatureId,
				name: "Skipped Feature Update",
				type: FeatureType.Boolean,
			},
		];
		const desiredPlans = [
			...(await desiredPlansWithout({
				autumn: autumnV2_2,
				planIds: [updatePlanId, removePlanId],
			})),
			{
				plan_id: updatePlanId,
				name: "Skipped Plan Update",
				items: [
					{
						feature_id: updateFeatureId,
						included: 500,
						reset: { interval: "month" },
					},
				],
			},
		];
		const skippedPayload = {
			skip_deletions: false,
			skip_feature_ids: [updateFeatureId, removeFeatureId],
			skip_plan_ids: [updatePlanId, removePlanId],
			features: desiredFeatures,
			plans: desiredPlans,
		};

		const preview = await autumnV2_2.post(
			"/catalog.preview_update",
			skippedPayload,
		);
		expectFeaturePreviewCorrect({
			preview,
			featureId: updateFeatureId,
			action: "skipped",
			blocked: false,
			willArchive: false,
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: removeFeatureId,
			action: "skipped",
			blocked: false,
			willArchive: false,
		});
		expectCatalogPreview({
			preview,
			planChanges: [
				{ planId: updatePlanId, action: "skipped", willArchive: false },
				{ planId: removePlanId, action: "skipped", willArchive: false },
			],
			logPreview: false,
		});

		await autumnV2_2.post("/catalog.update", skippedPayload);
		const updateFeature = await findFeature({
			autumn: autumnV2_2,
			featureId: updateFeatureId,
		});
		const removeFeature = await findFeature({
			autumn: autumnV2_2,
			featureId: removeFeatureId,
		});
		const updatePlan = await findPlan({ autumn: autumnV2_2, planId: updatePlanId });
		const removePlan = await findPlan({ autumn: autumnV2_2, planId: removePlanId });

		expect(updateFeature.name).toBe(updateFeatureId);
		expect(updateFeature.type).toBe(FeatureType.Metered);
		expect(removeFeature).toBeDefined();
		expect(removeFeature.archived).toBe(false);
		expect(
			updatePlan.items.find(
				(item: { feature_id: string }) => item.feature_id === updateFeatureId,
			)?.included,
		).toBe(100);
		expect(removePlan).toBeDefined();
		expect(removePlan.archived).toBe(false);
	},
);

test(
	`${chalk.yellowBright("catalog feature preview: create, update, remove shape")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const createId = featureId(`create_${suffix}`);
		const updateId = featureId(`update_${suffix}`);
		const removeId = featureId(`remove_${suffix}`);

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-feature-preview-${suffix}`,
			setup: [],
			actions: [],
		});
		await autumnV2_2.post("/features.create", {
			feature_id: updateId,
			name: "Old update feature",
			type: FeatureType.Boolean,
		});
		await autumnV2_2.post("/features.create", {
			feature_id: removeId,
			name: "Remove feature",
			type: FeatureType.Boolean,
		});

		const preview = await autumnV2_2.post("/catalog.preview_update", {
			skip_deletions: false,
			expand: ["feature_changes.feature"],
			features: [
				...(await desiredFeaturesWithout({
					autumn: autumnV2_2,
					featureIds: [updateId, removeId],
				})),
				createMeteredFeature(createId),
				{
					feature_id: updateId,
					name: "Updated feature",
					type: FeatureType.Boolean,
				},
			],
			plans: await desiredPlansWithout({ autumn: autumnV2_2, planIds: [] }),
		});

		expectFeaturePreviewCorrect({
			preview,
			featureId: createId,
			action: "create",
			blocked: false,
			blockedReason: null,
			willArchive: false,
			type: FeatureType.Metered,
			featureExpanded: true,
			previousAttributes: null,
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: updateId,
			action: "update",
			blocked: false,
			blockedReason: null,
			willArchive: false,
			type: FeatureType.Boolean,
			featureExpanded: true,
			previousAttributes: { name: "Old update feature" },
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: removeId,
			action: "remove",
			blocked: false,
			blockedReason: null,
			willArchive: false,
			featureExpanded: true,
			expandedFeatureIsNull: true,
		});
	},
);

test(
	`${chalk.yellowBright("catalog feature update: blocked feature updates are skipped")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const plan = products.pro({
			id: `catalog_feature_blocked_${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-feature-blocked-${suffix}`,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan], prefix: suffix }),
			],
			actions: [s.attach({ productId: plan.id })],
		});

		const preview = await autumnV2_2.post("/catalog.preview_update", {
			features: [
				{
					feature_id: TestFeature.Messages,
					name: "Messages",
					type: FeatureType.Boolean,
				},
			],
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: TestFeature.Messages,
			action: "update",
			blocked: true,
			blockedReason: "has_customers",
			willArchive: false,
		});

		await autumnV2_2.post("/catalog.update", {
			features: [
				{
					feature_id: TestFeature.Messages,
					name: "Messages",
					type: FeatureType.Boolean,
				},
			],
		});
		const messages = await findFeature({
			autumn: autumnV2_2,
			featureId: TestFeature.Messages,
		});
		expect(messages.type).toBe(FeatureType.Metered);
	},
);

test(
	`${chalk.yellowBright("catalog feature preview: blocked update reasons cover product and credit dependencies")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const pricedFeatureId = featureId(`priced_${suffix}`);
		const creditChildId = featureId(`credit_child_${suffix}`);
		const creditParentId = featureId(`credit_parent_${suffix}`);
		const booleanFeatureId = featureId(`bool_${suffix}`);
		const productFeatureId = featureId(`product_${suffix}`);
		const pricedPlanId = `catalog_blocker_price_${suffix}`;
		const productPlanId = `catalog_blocker_product_${suffix}`;

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-feature-blockers-${suffix}`,
			setup: [],
			actions: [],
		});
		await autumnV2_2.post("/features.create", createMeteredFeature(pricedFeatureId));
		await autumnV2_2.post("/features.create", createMeteredFeature(creditChildId));
		await autumnV2_2.post(
			"/features.create",
			createCreditSystemFeature({
				id: creditParentId,
				meteredFeatureId: creditChildId,
			}),
		);
		await autumnV2_2.post("/features.create", {
			feature_id: booleanFeatureId,
			name: booleanFeatureId,
			type: FeatureType.Boolean,
		});
		await autumnV2_2.post("/features.create", createMeteredFeature(productFeatureId));
		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: pricedPlanId,
					name: "Price blocker plan",
					items: [
						{
							feature_id: pricedFeatureId,
							included: 0,
							reset: { interval: "month" },
							price: {
								amount: 0.25,
								interval: "month",
								billing_units: 1,
								billing_method: "usage_based",
								max_purchase: null,
							},
						},
					],
				},
				{
					plan_id: productPlanId,
					name: "Product blocker plan",
					items: [
						{
							feature_id: productFeatureId,
							included: 100,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		const preview = await autumnV2_2.post("/catalog.preview_update", {
			features: [
				{
					feature_id: pricedFeatureId,
					name: pricedFeatureId,
					type: FeatureType.Boolean,
				},
				{
					feature_id: creditChildId,
					name: creditChildId,
					type: FeatureType.Boolean,
				},
				{
					feature_id: booleanFeatureId,
					name: booleanFeatureId,
					type: FeatureType.CreditSystem,
					consumable: true,
					credit_schema: [
						{ metered_feature_id: creditChildId, credit_cost: 1 },
					],
				},
				{
					feature_id: productFeatureId,
					name: productFeatureId,
					type: FeatureType.CreditSystem,
					consumable: true,
					credit_schema: [
						{ metered_feature_id: creditChildId, credit_cost: 1 },
					],
				},
			],
		});

		expectFeaturePreviewCorrect({
			preview,
			featureId: pricedFeatureId,
			action: "update",
			blocked: true,
			blockedReason: "has_usage_price",
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: creditChildId,
			action: "update",
			blocked: true,
			blockedReason: "used_in_credit_system",
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: booleanFeatureId,
			action: "update",
			blocked: true,
			blockedReason: "credit_system_type_change",
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: productFeatureId,
			action: "update",
			blocked: true,
			blockedReason: "used_in_products",
		});
	},
);

test(
	`${chalk.yellowBright("catalog feature preview: derived removals archive when still used")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const planFeatureId = featureId(`plan_used_${suffix}`);
		const planId = `catalog_feature_used_${suffix}`;

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-feature-used-${suffix}`,
			setup: [],
			actions: [],
		});
		await autumnV2_2.post("/features.create", createMeteredFeature(planFeatureId));
		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: planId,
					name: "Plan Used",
					items: [
						{
							feature_id: planFeatureId,
							included: 100,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		const preview = await autumnV2_2.post("/catalog.preview_update", {
			skip_deletions: false,
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [planFeatureId],
			}),
			plans: await desiredPlansWithout({ autumn: autumnV2_2, planIds: [] }),
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: planFeatureId,
			action: "remove",
			blocked: false,
			blockedReason: null,
			willArchive: true,
		});

		await autumnV2_2.post("/catalog.update", {
			skip_deletions: false,
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [planFeatureId],
			}),
			plans: await desiredPlansWithout({ autumn: autumnV2_2, planIds: [] }),
		});
		const archivedFeature = await findFeature({
			autumn: autumnV2_2,
			featureId: planFeatureId,
		});
		expect(archivedFeature.archived).toBe(true);
	},
);

test(
	`${chalk.yellowBright("catalog feature preview: credit-system dependency archives only when parent remains")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const meteredId = featureId(`metered_${suffix}`);
		const creditsId = featureId(`credits_${suffix}`);

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-feature-credit-${suffix}`,
			setup: [],
			actions: [],
		});
		await autumnV2_2.post("/features.create", createMeteredFeature(meteredId));
		await autumnV2_2.post(
			"/features.create",
			createCreditSystemFeature({ id: creditsId, meteredFeatureId: meteredId }),
		);

		const parentRemains = await autumnV2_2.post("/catalog.preview_update", {
			skip_deletions: false,
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [meteredId],
			}),
			plans: await desiredPlansWithout({ autumn: autumnV2_2, planIds: [] }),
		});
		expectFeaturePreviewCorrect({
			preview: parentRemains,
			featureId: meteredId,
			action: "remove",
			blocked: false,
			blockedReason: null,
			willArchive: true,
		});

		const bothRemoved = await autumnV2_2.post("/catalog.preview_update", {
			skip_deletions: false,
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [meteredId, creditsId],
			}),
			plans: await desiredPlansWithout({ autumn: autumnV2_2, planIds: [] }),
		});
		expectFeaturePreviewCorrect({
			preview: bothRemoved,
			featureId: creditsId,
			action: "remove",
			willArchive: false,
		});
		expectFeaturePreviewCorrect({
			preview: bothRemoved,
			featureId: meteredId,
			action: "remove",
			willArchive: false,
		});
	},
);

test(
	`${chalk.yellowBright("catalog update: removing a plan and its feature is atomic")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const removeFeatureId = featureId(`atomic_${suffix}`);
		const removePlanId = `catalog_atomic_${suffix}`;

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-feature-atomic-${suffix}`,
			setup: [],
			actions: [],
		});
		await autumnV2_2.post("/features.create", createMeteredFeature(removeFeatureId));
		await autumnV2_2.post("/catalog.update", {
			plans: [
				{
					plan_id: removePlanId,
					name: "Atomic Plan",
					items: [
						{
							feature_id: removeFeatureId,
							included: 100,
							reset: { interval: "month" },
						},
					],
				},
			],
		});

		const preview = await autumnV2_2.post("/catalog.preview_update", {
			skip_deletions: false,
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [removeFeatureId],
			}),
			plans: await desiredPlansWithout({
				autumn: autumnV2_2,
				planIds: [removePlanId],
			}),
		});
		expectCatalogPreview({
			preview,
			planChanges: [
				{ planId: removePlanId, action: "deleted", willArchive: false },
			],
			logPreview: false,
		});
		expectFeaturePreviewCorrect({
			preview,
			featureId: removeFeatureId,
			action: "remove",
			willArchive: false,
		});

		await autumnV2_2.post("/catalog.update", {
			skip_deletions: false,
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [removeFeatureId],
			}),
			plans: await desiredPlansWithout({
				autumn: autumnV2_2,
				planIds: [removePlanId],
			}),
		});
		expect(
			await findFeature({ autumn: autumnV2_2, featureId: removeFeatureId }),
		).toBeUndefined();
		const plans = await autumnV2_2.post("/plans.list", { include_archived: true });
		expect(plans.list.some((plan: { id: string }) => plan.id === removePlanId)).toBe(
			false,
		);
	},
);

test(
	`${chalk.yellowBright("catalog update: customer plan removals archive plans")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const plan = products.pro({
			id: `catalog_plan_archive_${suffix}`,
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const planId = `${plan.id}_${suffix}`;

		const { autumnV2_2 } = await initScenario({
			customerId: `catalog-plan-archive-${suffix}`,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan], prefix: suffix }),
			],
			actions: [s.attach({ productId: plan.id })],
		});

		const preview = await autumnV2_2.post("/catalog.preview_update", {
			skip_deletions: false,
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [],
			}),
			plans: await desiredPlansWithout({ autumn: autumnV2_2, planIds: [planId] }),
		});
		expectCatalogPreview({
			preview,
			planChanges: [
				{
					planId,
					action: "deleted",
					hasCustomers: true,
					willArchive: true,
				},
			],
			logPreview: false,
		});

		await autumnV2_2.post("/catalog.update", {
			skip_deletions: false,
			features: await desiredFeaturesWithout({
				autumn: autumnV2_2,
				featureIds: [],
			}),
			plans: await desiredPlansWithout({ autumn: autumnV2_2, planIds: [planId] }),
		});
		const activePlans = await autumnV2_2.post("/plans.list", {});
		expect(activePlans.list.some((entry: { id: string }) => entry.id === planId)).toBe(
			false,
		);
		const allPlans = await autumnV2_2.post("/plans.list", {
			include_archived: true,
		});
		const archived = allPlans.list.find(
			(entry: { id: string }) => entry.id === planId,
		);
		expect(archived?.archived).toBe(true);
	},
);
