import {
	ApiVersion,
	AppEnv,
	FeatureUsageType,
	type ProductItem,
	type ProductV2,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { productItemsToCustomizePlanV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { clearOrg } from "@tests/utils/setup/clearOrg.js";
import defaultCtx, {
	createTestContext,
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import {
	constructBooleanFeature,
	constructCreditSystem,
	constructMeteredFeature,
} from "@/internal/features/utils/constructFeatureUtils";
import { FeatureService } from "@/internal/features/FeatureService";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

const EMAIL_MINI_GROUP = "email-mini";

const MINI_SEED = {
	clear: true,
};

type RpcUpdatePlan = Omit<UpdatePlanParamsV2Input, "plan_id">;
type MiniPlanKey =
	| "free"
	| "free10k"
	| "pro"
	| "pro100k"
	| "proMarketing"
	| "proMarketing10k";
type MiniBasePlanKey = "free" | "pro" | "proMarketing";
type MiniVariantPlanKey = Exclude<MiniPlanKey, MiniBasePlanKey>;

const emailMiniFeatureIds = {
	ai_actions: "ai_actions",
	ai_credits: "ai_credits",
	automation_runs: "automation_runs",
	contacts: "contacts",
	domains: "domains",
	emails: "emails",
	no_daily_limit: "no_daily_limit",
} as const;

type EmailMiniFeatureId =
	(typeof emailMiniFeatureIds)[keyof typeof emailMiniFeatureIds];

const featureNames: Record<EmailMiniFeatureId, string> = {
	ai_actions: "AI Actions",
	ai_credits: "AI Credits",
	automation_runs: "Automation Runs",
	contacts: "Contacts",
	domains: "Domains",
	emails: "Emails",
	no_daily_limit: "No Daily Limit",
};

const ensureEmailMiniFeatures = async ({
	ctx = defaultCtx,
}: {
	ctx?: TestContext;
} = {}) => {
	const { org, env } = ctx;
	const desiredFeatures = [
		constructMeteredFeature({
			featureId: emailMiniFeatureIds.emails,
			name: featureNames.emails,
			orgId: org.id,
			env,
			usageType: FeatureUsageType.Single,
			eventNames: ["emails"],
		}),
		constructMeteredFeature({
			featureId: emailMiniFeatureIds.automation_runs,
			name: featureNames.automation_runs,
			orgId: org.id,
			env,
			usageType: FeatureUsageType.Single,
			eventNames: ["automation_runs"],
		}),
		constructMeteredFeature({
			featureId: emailMiniFeatureIds.ai_actions,
			name: featureNames.ai_actions,
			orgId: org.id,
			env,
			usageType: FeatureUsageType.Single,
			eventNames: ["ai_actions"],
		}),
		constructCreditSystem({
			featureId: emailMiniFeatureIds.ai_credits,
			name: featureNames.ai_credits,
			orgId: org.id,
			env,
			schema: [
				{
					metered_feature_id: emailMiniFeatureIds.ai_actions,
					credit_cost: 1,
				},
			],
		}),
		constructMeteredFeature({
			featureId: emailMiniFeatureIds.contacts,
			name: featureNames.contacts,
			orgId: org.id,
			env,
			usageType: FeatureUsageType.Continuous,
		}),
		constructMeteredFeature({
			featureId: emailMiniFeatureIds.domains,
			name: featureNames.domains,
			orgId: org.id,
			env,
			usageType: FeatureUsageType.Continuous,
		}),
		constructBooleanFeature({
			featureId: emailMiniFeatureIds.no_daily_limit,
			name: featureNames.no_daily_limit,
			orgId: org.id,
			env,
		}),
	];

	const existingFeatures = await FeatureService.list({
		db: ctx.db,
		orgId: org.id,
		env,
	});
	const existingById = new Map(
		existingFeatures.map((feature) => [feature.id, feature]),
	);
	const featuresToInsert = desiredFeatures.filter(
		(feature) => !existingById.has(feature.id),
	);

	if (featuresToInsert.length > 0) {
		await FeatureService.insert({
			db: ctx.db,
			data: featuresToInsert,
			logger: console,
		});
	}

	ctx.features = await FeatureService.list({
		db: ctx.db,
		orgId: org.id,
		env,
	});
};

const productItemsToPlanUpdate = ({
	ctx,
	items,
}: {
	ctx: TestContext;
	items: ProductItem[];
}): Pick<RpcUpdatePlan, "price" | "items"> => {
	const customize = productItemsToCustomizePlanV1({ ctx, items });

	return {
		price: customize.price,
		items: customize.items?.map((item) => ({ ...item, proration: undefined })),
	};
};

const booleanItem = (featureId: string): ProductItem =>
	constructFeatureItem({
		featureId,
		isBoolean: true,
	}) as ProductItem;

const automationItem = () =>
	items.free({
		featureId: emailMiniFeatureIds.automation_runs,
		includedUsage: 10_000,
	});

const emailItems = ({
	includedEmails,
	overagePerThousand,
}: {
	includedEmails: number;
	overagePerThousand?: number;
}) => [
	overagePerThousand === undefined
		? items.free({
				featureId: emailMiniFeatureIds.emails,
				includedUsage: includedEmails,
			})
		: items.consumable({
				featureId: emailMiniFeatureIds.emails,
				includedUsage: includedEmails,
				billingUnits: 1_000,
				price: overagePerThousand,
			}),
];

const transactionalPlan = ({
	id,
	name,
	price,
	emails,
}: {
	id: string;
	name: string;
	price: number;
	emails: number;
}): ProductV2 => ({
	...products.base({
		id,
		items: [
			items.monthlyPrice({ price }),
			...emailItems({ includedEmails: emails, overagePerThousand: 0.9 }),
			automationItem(),
			items.free({
				featureId: emailMiniFeatureIds.ai_credits,
				includedUsage: 100,
			}),
			items.free({
				featureId: emailMiniFeatureIds.domains,
				includedUsage: 10,
			}),
			booleanItem(emailMiniFeatureIds.no_daily_limit),
		],
	}),
	name,
});

const marketingPlan = ({
	id,
	name,
	price,
	contacts,
}: {
	id: string;
	name: string;
	price: number;
	contacts: number;
}): ProductV2 => ({
	...products.base({
		id,
		items: [
			items.monthlyPrice({ price }),
			items.free({
				featureId: emailMiniFeatureIds.contacts,
				includedUsage: contacts,
			}),
			items.free({
				featureId: emailMiniFeatureIds.ai_credits,
				includedUsage: 100,
			}),
			booleanItem(emailMiniFeatureIds.no_daily_limit),
		],
	}),
	name,
});

export const buildEmailMiniProducts = () => {
	const basePlans = {
		free: {
			...products.base({
				id: "free",
				items: [
					...emailItems({ includedEmails: 3_000 }),
					automationItem(),
					items.free({
						featureId: emailMiniFeatureIds.ai_credits,
						includedUsage: 5,
					}),
					items.free({
						featureId: emailMiniFeatureIds.domains,
						includedUsage: 1,
					}),
				],
			}),
			name: "Free",
		},
		pro: transactionalPlan({
			id: "pro",
			name: "Pro 50k",
			price: 20,
			emails: 50_000,
		}),
		proMarketing: marketingPlan({
			id: "pro_marketing",
			name: "Pro Marketing 5k",
			price: 40,
			contacts: 5_000,
		}),
	} satisfies Record<MiniBasePlanKey, ProductV2>;

	const variantPlans = {
		free10k: {
			...products.base({
				id: "free_10k",
				items: [
					...emailItems({ includedEmails: 10_000 }),
					automationItem(),
					items.free({
						featureId: emailMiniFeatureIds.ai_credits,
						includedUsage: 5,
					}),
					items.free({
						featureId: emailMiniFeatureIds.domains,
						includedUsage: 1,
					}),
				],
			}),
			name: "Free 10k",
		},
		pro100k: transactionalPlan({
			id: "pro_100k",
			name: "Pro 100k",
			price: 35,
			emails: 100_000,
		}),
		proMarketing10k: marketingPlan({
			id: "pro_marketing_10k",
			name: "Pro Marketing 10k",
			price: 80,
			contacts: 10_000,
		}),
	} satisfies Record<MiniVariantPlanKey, ProductV2>;

	return {
		basePlans,
		variantPlans,
		variantPlanConfigs: [
			{ key: "free10k", baseKey: "free", name: "Free 10k" },
			{ key: "pro100k", baseKey: "pro", name: "Pro 100k" },
			{
				key: "proMarketing10k",
				baseKey: "proMarketing",
				name: "Pro Marketing 10k",
			},
		] satisfies {
			key: MiniVariantPlanKey;
			baseKey: MiniBasePlanKey;
			name: string;
		}[],
		plans: {
			...basePlans,
			...variantPlans,
		},
	};
};

type EmailMiniCatalog = ReturnType<typeof buildEmailMiniProducts>;

const withProductGroup = ({
	productList,
	group,
}: {
	productList: ProductV2[];
	group: string;
}) =>
	productList.map((product) => ({
		...product,
		group,
	}));

export const createEmailMiniVariants = async ({
	ctx = defaultCtx,
	catalog = buildEmailMiniProducts(),
}: {
	ctx?: TestContext;
	catalog?: EmailMiniCatalog;
} = {}) => {
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	for (const config of catalog.variantPlanConfigs) {
		const basePlan = catalog.basePlans[config.baseKey];
		const variantPlan = catalog.variantPlans[config.key];

		try {
			await rpc.plans.delete(variantPlan.id, { allVersions: true });
		} catch {}

		try {
			await rpc.post("/plans.create_variant", {
				base_plan_id: basePlan.id,
				variant_plan_id: variantPlan.id,
				name: config.name,
			});
		} catch (error) {
			if ((error as { code?: string }).code !== "product_id_already_exists") {
				throw error;
			}
		}

		await rpc.plans.update<unknown, RpcUpdatePlan>(variantPlan.id, {
			name: config.name,
			...productItemsToPlanUpdate({ ctx, items: variantPlan.items }),
		});
	}
};

export const seedEmailMiniCatalog = async ({
	ctx = defaultCtx,
	group = EMAIL_MINI_GROUP,
}: {
	ctx?: TestContext;
	group?: string;
} = {}) => {
	await ensureEmailMiniFeatures({ ctx });

	const catalog = buildEmailMiniProducts();
	await initScenario({
		setup: [
			s.products({
				list: withProductGroup({
					productList: Object.values(catalog.basePlans),
					group,
				}),
				prefix: "",
				createInStripe: false,
			}),
		],
		actions: [],
		ctx,
	});
	await createEmailMiniVariants({ ctx, catalog });

	return { ...catalog, group };
};

export const runEmailMiniSeed = async () => {
	if (!process.env.TESTS_ORG) {
		throw new Error("TESTS_ORG is required to seed email mini data");
	}

	if (MINI_SEED.clear && !process.argv.includes("--skip-clear")) {
		await clearOrg({
			orgSlug: process.env.TESTS_ORG,
			env: AppEnv.Sandbox,
			skipStripeReset: true,
		});
	}

	const ctx = await createTestContext();
	const result = await seedEmailMiniCatalog({ ctx });

	console.log("Email mini seed complete", {
		basePlans: Object.keys(result.basePlans).length,
		variants: Object.keys(result.variantPlans).length,
		group: result.group,
	});
};

if (import.meta.main) {
	runEmailMiniSeed()
		.catch((error) => {
			console.error("Email mini seed failed:", error);
			process.exit(1);
		})
		.finally(() => {
			process.exit(0);
		});
}
