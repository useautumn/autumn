import {
	FeatureUsageType,
	type ProductItem,
	type ProductV2,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import defaultCtx, {
	createTestContext,
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { FeatureService } from "@/internal/features/FeatureService";
import {
	constructBooleanFeature,
	constructCreditSystem,
	constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";
import {
	buildRealisticCustomerSeed,
	createScenarioAutumn,
	seedCustomersWithEntities,
} from "../seedUtils";

export const knowledgePlatformFeatureIds = {
	activity_events: "activity_events",
	approval_chains: "approval_chains",
	automation_rules: "automation_rules",
	brand_controls: "brand_controls",
	compliance_controls: "compliance_controls",
	credits: "credits",
	export_center: "export_center",
	hosted_solution: "hosted_solution",
	insight_reports: "insight_reports",
	member_slots: "member_slots",
	outbound_hooks: "outbound_hooks",
	platform_api: "platform_api",
	priority_queue: "priority_queue",
	private_spaces: "private_spaces",
	project_slots: "project_slots",
	revision_history: "revision_history",
	team_policies: "team_policies",
	unlimited_seats: "unlimited_seats",
	workspaces: "workspaces",
} as const;

export const knowledgePlatformPlanIds = {
	automationPack: "automation_pack",
	enterprise: "enterprise",
	launch: "launch",
	scale: "scale",
	scaleYearly: "scale_yearly",
	securityPack: "security_pack",
	trial: "trial",
	whiteLabelPack: "white_label_pack",
} as const;

export const knowledgePlatformPlatformFeatureIds = [
	knowledgePlatformFeatureIds.insight_reports,
	knowledgePlatformFeatureIds.team_policies,
	knowledgePlatformFeatureIds.private_spaces,
	knowledgePlatformFeatureIds.export_center,
	knowledgePlatformFeatureIds.priority_queue,
	knowledgePlatformFeatureIds.automation_rules,
	knowledgePlatformFeatureIds.outbound_hooks,
	knowledgePlatformFeatureIds.platform_api,
	knowledgePlatformFeatureIds.approval_chains,
	knowledgePlatformFeatureIds.brand_controls,
	knowledgePlatformFeatureIds.compliance_controls,
	knowledgePlatformFeatureIds.revision_history,
] as const;

export const knowledgePlatformContractFeatureIds = [
	knowledgePlatformFeatureIds.hosted_solution,
	knowledgePlatformFeatureIds.unlimited_seats,
] as const;

const featureNames: Partial<Record<KnowledgePlatformFeatureId, string>> = {
	activity_events: "Activity Events",
	hosted_solution: "Hosted Solution",
	unlimited_seats: "Unlimited Seats",
	workspaces: "Workspaces",
};

type KnowledgePlatformFeatureId =
	(typeof knowledgePlatformFeatureIds)[keyof typeof knowledgePlatformFeatureIds];

type KnowledgePlatformPlanMap = ReturnType<
	typeof buildKnowledgePlatformProducts
>["plans"];

export type KnowledgePlatformPlanKey = keyof KnowledgePlatformPlanMap;

const booleanItem = (featureId: KnowledgePlatformFeatureId): ProductItem =>
	constructFeatureItem({
		featureId,
		isBoolean: true,
	}) as ProductItem;

const booleanItems = (featureIds: readonly KnowledgePlatformFeatureId[]) =>
	featureIds.map(booleanItem);

const creditItems = () => [
	items.prepaid({
		featureId: knowledgePlatformFeatureIds.credits,
		billingUnits: 1_000,
		price: 100,
	}),
	items.consumable({
		featureId: knowledgePlatformFeatureIds.credits,
		billingUnits: 1,
		price: 0.1,
	}),
];

export const buildKnowledgePlatformFeatures = ({
	ctx,
}: {
	ctx: TestContext;
}) => {
	const f = knowledgePlatformFeatureIds;
	const orgId = ctx.org.id;
	const env = ctx.env;
	const booleanFeatureIds = [
		...knowledgePlatformPlatformFeatureIds,
		...knowledgePlatformContractFeatureIds,
	];

	return [
		constructMeteredFeature({
			featureId: f.activity_events,
			name: featureNames[f.activity_events],
			orgId,
			env,
			usageType: FeatureUsageType.Single,
			eventNames: ["activity_events"],
		}),
		constructCreditSystem({
			featureId: f.credits,
			orgId,
			env,
			schema: [{ metered_feature_id: f.activity_events, credit_cost: 1 }],
		}),
		constructMeteredFeature({
			featureId: f.member_slots,
			orgId,
			env,
			usageType: FeatureUsageType.Continuous,
		}),
		constructMeteredFeature({
			featureId: f.project_slots,
			orgId,
			env,
			usageType: FeatureUsageType.Continuous,
		}),
		constructMeteredFeature({
			featureId: f.workspaces,
			name: featureNames[f.workspaces],
			orgId,
			env,
			usageType: FeatureUsageType.Continuous,
		}),
		...booleanFeatureIds.map((featureId) =>
			constructBooleanFeature({
				featureId,
				name: featureNames[featureId],
				orgId,
				env,
			}),
		),
	];
};

export const ensureKnowledgePlatformFeatures = async ({
	ctx = defaultCtx,
}: {
	ctx?: TestContext;
} = {}) => {
	const desiredFeatures = buildKnowledgePlatformFeatures({ ctx });
	const existingFeatures = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const existingById = new Map(
		existingFeatures.map((feature) => [feature.id, feature]),
	);

	const featuresToInsert = desiredFeatures.filter(
		(feature) => !existingById.has(feature.id),
	);
	const featuresToUpdate = desiredFeatures.filter((feature) =>
		existingById.has(feature.id),
	);

	if (featuresToInsert.length > 0) {
		await FeatureService.insert({
			db: ctx.db,
			data: featuresToInsert,
			logger: console,
		});
	}

	await Promise.all(
		featuresToUpdate.map((feature) =>
			FeatureService.update({
				db: ctx.db,
				id: feature.id,
				orgId: ctx.org.id,
				env: ctx.env,
				updates: {
					name: feature.name,
					type: feature.type,
					config: feature.config,
					event_names: feature.event_names,
					model_markups: feature.model_markups,
					archived: false,
				},
			}),
		),
	);

	ctx.features = await FeatureService.list({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	return ctx.features.filter((feature) =>
		desiredFeatures.some((desired) => desired.id === feature.id),
	);
};

export const buildKnowledgePlatformProducts = () => {
	const f = knowledgePlatformFeatureIds;
	const p = knowledgePlatformPlanIds;
	const coreFeatures = [
		f.insight_reports,
		f.team_policies,
		f.private_spaces,
		f.export_center,
		f.automation_rules,
		f.platform_api,
	] as const;
	const expandedFeatures = [
		...coreFeatures,
		f.priority_queue,
		f.outbound_hooks,
		f.approval_chains,
		f.brand_controls,
		f.compliance_controls,
		f.revision_history,
	] as const;

	const plans = {
		launch: products.base({
			id: p.launch,
			items: [
				items.monthlyPrice({ price: 300 }),
				...creditItems(),
				...booleanItems(coreFeatures),
			],
		}),
		scale: products.base({
			id: p.scale,
			items: [
				items.monthlyPrice({ price: 500 }),
				...creditItems(),
				...booleanItems(expandedFeatures),
			],
		}),
		scaleYearly: products.base({
			id: p.scaleYearly,
			items: [
				items.annualPrice({ price: 5_000 }),
				...creditItems(),
				...booleanItems(expandedFeatures),
			],
		}),
		trial: products.base({
			id: p.trial,
			items: [
				items.free({ featureId: f.credits, includedUsage: 1_000 }),
				...booleanItems([f.insight_reports, f.private_spaces, f.platform_api]),
			],
		}),
		enterprise: products.base({
			id: p.enterprise,
			items: [
				...creditItems(),
				items.free({ featureId: f.member_slots, includedUsage: 25 }),
				items.free({ featureId: f.project_slots, includedUsage: 100 }),
				...booleanItems(expandedFeatures),
			],
		}),
		automationPack: products.base({
			id: p.automationPack,
			isAddOn: true,
			items: [
				items.monthlyPrice({ price: 75 }),
				booleanItem(f.automation_rules),
			],
		}),
		securityPack: products.base({
			id: p.securityPack,
			isAddOn: true,
			items: [
				items.annualPrice({ price: 2_400 }),
				booleanItem(f.compliance_controls),
			],
		}),
		whiteLabelPack: products.base({
			id: p.whiteLabelPack,
			isAddOn: true,
			items: [
				items.annualPrice({ price: 3_000 }),
				booleanItem(f.brand_controls),
			],
		}),
	} satisfies Record<string, ProductV2>;

	return {
		featureIds: knowledgePlatformFeatureIds,
		planIds: knowledgePlatformPlanIds,
		coreFeatures,
		expandedFeatures,
		plans,
	};
};

export const initKnowledgePlatformScenario = async ({
	customerId = "agent-knowledge-platform",
	attachPlan = "trial",
	entityCount = 2,
	paymentMethod = "success",
	ctx = defaultCtx,
}: {
	customerId?: string;
	attachPlan?: KnowledgePlatformPlanKey | null;
	entityCount?: number;
	paymentMethod?: "success" | "fail" | "authenticate" | "alipay";
	ctx?: TestContext;
} = {}) => {
	await ensureKnowledgePlatformFeatures({ ctx });

	const catalog = buildKnowledgePlatformProducts();
	const setup = [
		s.customer({ paymentMethod }),
		s.products({ list: Object.values(catalog.plans) }),
		...(entityCount > 0
			? [
					s.entities({
						count: entityCount,
						featureId: catalog.featureIds.workspaces,
					}),
				]
			: []),
	];
	const actions = attachPlan
		? [s.billing.attach({ productId: catalog.plans[attachPlan].id })]
		: [];
	const scenario = await initScenario({
		customerId,
		setup,
		actions,
		ctx,
	});

	return {
		...scenario,
		...catalog,
	};
};

export const seedKnowledgePlatformCustomers = async ({
	customerCount = 1_000,
	idPrefix = "kp-customer",
	entityCountForCustomer,
	productPrefix = "knowledge-platform",
	attachPlan = null,
	concurrency = 10,
	deleteExisting = true,
	ctx = defaultCtx,
}: {
	customerCount?: number;
	idPrefix?: string;
	entityCountForCustomer?: (index: number) => 1 | 2;
	productPrefix?: string;
	attachPlan?: Extract<KnowledgePlatformPlanKey, "trial" | "enterprise"> | null;
	concurrency?: number;
	deleteExisting?: boolean;
	ctx?: TestContext;
} = {}) => {
	await ensureKnowledgePlatformFeatures({ ctx });

	const catalog = buildKnowledgePlatformProducts();
	await initScenario({
		setup: [
			s.products({
				list: Object.values(catalog.plans),
				prefix: productPrefix,
				createInStripe: false,
			}),
		],
		actions: [],
		ctx,
	});

	const customers = Array.from({ length: customerCount }, (_, index) => {
		return {
			...buildRealisticCustomerSeed({
				index,
				idPrefix,
				entityFeatureId: knowledgePlatformFeatureIds.workspaces,
				entityCount: entityCountForCustomer?.(index),
			}),
			attachPlanId: attachPlan ? catalog.plans[attachPlan].id : null,
		};
	});

	const seeded = await seedCustomersWithEntities({
		autumn: createScenarioAutumn({ ctx }),
		customers,
		concurrency,
		deleteExisting,
	});

	return {
		...catalog,
		productPrefix,
		...seeded,
	};
};

const getArgValue = (name: string) => {
	const prefix = `${name}=`;
	const inline = process.argv.find((arg) => arg.startsWith(prefix));
	if (inline) return inline.slice(prefix.length);

	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
};

const runKnowledgePlatformSeed = async () => {
	const customerCount = Number(getArgValue("--count") ?? "1000");
	const concurrency = Number(getArgValue("--concurrency") ?? "10");
	const attachPlan = getArgValue("--attach-plan") as
		| Extract<KnowledgePlatformPlanKey, "trial" | "enterprise">
		| undefined;
	const ctx = await createTestContext();

	const result = await seedKnowledgePlatformCustomers({
		ctx,
		customerCount,
		concurrency,
		attachPlan: attachPlan ?? null,
		deleteExisting: !process.argv.includes("--keep-existing"),
	});

	console.log("Knowledge platform seed complete", {
		customers: result.customerCount,
		entities: result.entityCount,
		productPrefix: result.productPrefix,
		attachPlan: attachPlan ?? null,
	});
};

if (import.meta.main) {
	runKnowledgePlatformSeed()
		.catch((error) => {
			console.error("Knowledge platform seed failed:", error);
			process.exit(1);
		})
		.finally(() => {
			process.exit(0);
		});
}
