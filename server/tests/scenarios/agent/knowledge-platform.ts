import {
	AppEnv,
	FeatureUsageType,
	type FreeTrial,
	FreeTrialDuration,
	type ProductItem,
	type ProductV2,
	TierBehavior,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { clearOrg } from "@tests/utils/setup/clearOrg.js";
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
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";
import {
	buildRealisticCustomerSeed,
	createScenarioAutumn,
	seedCustomersWithEntities,
} from "../seedUtils";

// ── Knowledge platform seed config ──
// Defaults for `bun scenario kp`; CLI flags override (e.g. `bun scenario kp --count 1000`).
const KP_SEED = {
	customerCount: 0, // 0 = catalog only (features + plans, no customers)
	concurrency: 10,
	attachPlan: null as "trial" | "enterprise" | null,
	clear: true, // wipe org before seeding; --skip-clear keeps existing
};

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

// 1k included, then volume-priced packs: the whole purchased quantity is
// charged the flat amount of the tier it lands in.
const creditTiers = [
	{ amount: 0, to: 2_000, flat_amount: 200 },
	{ amount: 0, to: 3_500, flat_amount: 300 },
	{ amount: 0, to: 5_000, flat_amount: 400 },
	{ amount: 0, to: 7_000, flat_amount: 500 },
	{ amount: 0, to: "inf" as const, flat_amount: 600 },
];

const creditItems = () => [
	constructPrepaidItem({
		featureId: knowledgePlatformFeatureIds.credits,
		billingUnits: 1,
		includedUsage: 1_000,
		tierBehaviour: TierBehavior.VolumeBased,
		tiers: creditTiers,
	}) as ProductItem,
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

const withProductGroup = ({
	products,
	group,
}: {
	products: ProductV2[];
	group: string;
}) =>
	products.map((product) => ({
		...product,
		group,
	}));

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

/** Return a copy of a plan with a card-required free trial, for trialing-state scenarios. */
export const withFreeTrial = ({
	product,
	trialDays,
}: {
	product: ProductV2;
	trialDays: number;
}): ProductV2 => ({
	...product,
	free_trial: {
		length: trialDays,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: true,
	} as unknown as FreeTrial,
});

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
				list: withProductGroup({
					products: Object.values(catalog.plans),
					group: productPrefix,
				}),
				prefix: "",
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

export const runKnowledgePlatformSeed = async () => {
	const customerCount = Number(getArgValue("--count") ?? KP_SEED.customerCount);
	const concurrency = Number(getArgValue("--concurrency") ?? KP_SEED.concurrency);
	const attachPlan = (getArgValue("--attach-plan") ?? KP_SEED.attachPlan) as
		| Extract<KnowledgePlatformPlanKey, "trial" | "enterprise">
		| null;
	if (!process.env.TESTS_ORG) {
		throw new Error("TESTS_ORG is required to seed knowledge platform data");
	}

	if (KP_SEED.clear && !process.argv.includes("--skip-clear")) {
		await clearOrg({
			orgSlug: process.env.TESTS_ORG,
			env: AppEnv.Sandbox,
			skipStripeReset: true,
		});
	}

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
