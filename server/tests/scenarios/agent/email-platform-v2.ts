import {
	ApiVersion,
	AppEnv,
	type AttachParamsV1Input,
	FeatureUsageType,
	type FreeTrial,
	FreeTrialDuration,
	type ProductItem,
	type ProductV2,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { productItemsToCustomizePlanV1 } from "@autumn/shared/utils/productV2Utils/productItemUtils/convertProductItem/productItemsToCustomizePlanV1";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { clearOrg } from "@tests/utils/setup/clearOrg.js";
import defaultCtx, {
	createTestContext,
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
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

// ── Email platform seed config ──
// Modeled loosely on Resend's pricing. Transactional paid tiers are represented
// as variants, each with its own base price and overage item.
// Defaults for `bun scenario ep`; CLI flags override (e.g. `--count 1000`).
const EP_SEED = {
	customerCount: 0, // 0 = catalog only (features + plans, no customers)
	concurrency: 10,
	attachPlan: null as "free" | "enterprise" | null,
	clear: true, // wipe org before seeding; --skip-clear keeps existing
};

export const emailPlatformFeatureIds = {
	ai_actions: "ai_actions",
	ai_credits: "ai_credits",
	automation_runs: "automation_runs",
	contacts: "contacts",
	dedicated_ip: "dedicated_ip",
	domains: "domains",
	emails: "emails",
	engagement_tracking: "engagement_tracking",
	inbound_routing: "inbound_routing",
	multi_region: "multi_region",
	no_daily_limit: "no_daily_limit",
	priority_support: "priority_support",
	projects: "projects",
	scoped_api_keys: "scoped_api_keys",
	sending_receiving: "sending_receiving",
	slack_support: "slack_support",
	smtp_relay: "smtp_relay",
	soc2_reports: "soc2_reports",
	sso_saml: "sso_saml",
	ticket_support: "ticket_support",
	webhooks: "webhooks",
} as const;

export const emailPlatformPlanIds = {
	dedicatedIpPack: "dedicated_ip_pack",
	enterprise: "enterprise",
	free: "free",
	pro: "pro",
	pro100k: "pro_100k",
	proMarketing: "pro_marketing",
	proMarketing10k: "pro_marketing_10k",
	proMarketing15k: "pro_marketing_15k",
	proMarketing25k: "pro_marketing_25k",
	proMarketing50k: "pro_marketing_50k",
	proMarketing100k: "pro_marketing_100k",
	proMarketing150k: "pro_marketing_150k",
	scale: "scale",
	scale200k: "scale_200k",
	scale500k: "scale_500k",
	scale1m: "scale_1m",
	scale1_5m: "scale_1_5m",
	scale2_5m: "scale_2_5m",
} as const;

// Boolean flags shared by every plan ("all plans include ...").
const sharedBooleanFeatureIds = [
	emailPlatformFeatureIds.sending_receiving,
	emailPlatformFeatureIds.smtp_relay,
	emailPlatformFeatureIds.inbound_routing,
	emailPlatformFeatureIds.engagement_tracking,
	emailPlatformFeatureIds.multi_region,
	emailPlatformFeatureIds.webhooks,
	emailPlatformFeatureIds.soc2_reports,
	emailPlatformFeatureIds.scoped_api_keys,
] as const;

// Tier-specific boolean flags.
const tieredBooleanFeatureIds = [
	emailPlatformFeatureIds.ticket_support,
	emailPlatformFeatureIds.slack_support,
	emailPlatformFeatureIds.priority_support,
	emailPlatformFeatureIds.no_daily_limit,
	emailPlatformFeatureIds.dedicated_ip,
	emailPlatformFeatureIds.sso_saml,
] as const;

export const emailPlatformBooleanFeatureIds = [
	...sharedBooleanFeatureIds,
	...tieredBooleanFeatureIds,
] as const;

type EmailPlatformFeatureId =
	(typeof emailPlatformFeatureIds)[keyof typeof emailPlatformFeatureIds];

const featureNames: Record<EmailPlatformFeatureId, string> = {
	ai_actions: "AI Actions",
	ai_credits: "AI Credits",
	automation_runs: "Automation Runs",
	contacts: "Contacts",
	dedicated_ip: "Dedicated IP",
	domains: "Domains",
	emails: "Emails",
	engagement_tracking: "Engagement Tracking",
	inbound_routing: "Inbound Routing",
	multi_region: "Multi-Region Sending",
	no_daily_limit: "No Daily Limit",
	priority_support: "Priority Support",
	projects: "Projects",
	scoped_api_keys: "Scoped API Keys",
	sending_receiving: "Sending & Receiving",
	slack_support: "Slack Support",
	smtp_relay: "SMTP Relay",
	soc2_reports: "SOC 2 Reports",
	sso_saml: "SSO / SAML",
	ticket_support: "Ticket Support",
	webhooks: "Webhooks",
};

type EmailPlatformPlanMap = ReturnType<
	typeof buildEmailPlatformProducts
>["plans"];

export type EmailPlatformPlanKey = keyof EmailPlatformPlanMap;
type RpcUpdatePlan = Omit<UpdatePlanParamsV2Input, "plan_id">;

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

const booleanItem = (featureId: EmailPlatformFeatureId): ProductItem =>
	constructFeatureItem({
		featureId,
		isBoolean: true,
	}) as ProductItem;

const booleanItems = (featureIds: readonly EmailPlatformFeatureId[]) =>
	featureIds.map(booleanItem);

const emailItems = ({
	includedEmails,
	overagePerThousand,
}: {
	includedEmails: number;
	overagePerThousand: number;
}) => [
	items.consumable({
		featureId: emailPlatformFeatureIds.emails,
		includedUsage: includedEmails,
		billingUnits: 1_000,
		price: overagePerThousand,
	}),
];

// 10k automation runs included, then per-run overage.
const automationItems = () => [
	items.consumable({
		featureId: emailPlatformFeatureIds.automation_runs,
		includedUsage: 10_000,
		billingUnits: 1,
		price: 0.0015,
	}),
];

type TransactionalTier = {
	key:
		| "pro"
		| "pro100k"
		| "scale"
		| "scale200k"
		| "scale500k"
		| "scale1m"
		| "scale1_5m"
		| "scale2_5m";
	baseKey: "pro" | "scale";
	name: string;
	price: number;
	emails: number;
	overagePerThousand: number;
};

type MarketingTier = {
	key:
		| "proMarketing"
		| "proMarketing10k"
		| "proMarketing15k"
		| "proMarketing25k"
		| "proMarketing50k"
		| "proMarketing100k"
		| "proMarketing150k";
	baseKey: "proMarketing";
	name: string;
	price: number;
	contacts: number;
};

const transactionalTiers = [
	{
		key: "pro",
		baseKey: "pro",
		name: "Pro 50k",
		price: 20,
		emails: 50_000,
		overagePerThousand: 0.9,
	},
	{
		key: "pro100k",
		baseKey: "pro",
		name: "Pro 100k",
		price: 35,
		emails: 100_000,
		overagePerThousand: 0.9,
	},
	{
		key: "scale",
		baseKey: "scale",
		name: "Scale 100k",
		price: 90,
		emails: 100_000,
		overagePerThousand: 0.9,
	},
	{
		key: "scale200k",
		baseKey: "scale",
		name: "Scale 200k",
		price: 160,
		emails: 200_000,
		overagePerThousand: 0.8,
	},
	{
		key: "scale500k",
		baseKey: "scale",
		name: "Scale 500k",
		price: 350,
		emails: 500_000,
		overagePerThousand: 0.7,
	},
	{
		key: "scale1m",
		baseKey: "scale",
		name: "Scale 1m",
		price: 650,
		emails: 1_000_000,
		overagePerThousand: 0.65,
	},
	{
		key: "scale1_5m",
		baseKey: "scale",
		name: "Scale 1.5m",
		price: 825,
		emails: 1_500_000,
		overagePerThousand: 0.52,
	},
	{
		key: "scale2_5m",
		baseKey: "scale",
		name: "Scale 2.5m",
		price: 1_150,
		emails: 2_500_000,
		overagePerThousand: 0.46,
	},
] satisfies TransactionalTier[];

const marketingTiers = [
	{
		key: "proMarketing",
		baseKey: "proMarketing",
		name: "Pro Marketing 5k",
		price: 40,
		contacts: 5_000,
	},
	{
		key: "proMarketing10k",
		baseKey: "proMarketing",
		name: "Pro Marketing 10k",
		price: 80,
		contacts: 10_000,
	},
	{
		key: "proMarketing15k",
		baseKey: "proMarketing",
		name: "Pro Marketing 15k",
		price: 120,
		contacts: 15_000,
	},
	{
		key: "proMarketing25k",
		baseKey: "proMarketing",
		name: "Pro Marketing 25k",
		price: 180,
		contacts: 25_000,
	},
	{
		key: "proMarketing50k",
		baseKey: "proMarketing",
		name: "Pro Marketing 50k",
		price: 250,
		contacts: 50_000,
	},
	{
		key: "proMarketing100k",
		baseKey: "proMarketing",
		name: "Pro Marketing 100k",
		price: 450,
		contacts: 100_000,
	},
	{
		key: "proMarketing150k",
		baseKey: "proMarketing",
		name: "Pro Marketing 150k",
		price: 650,
		contacts: 150_000,
	},
] satisfies MarketingTier[];

export const buildEmailPlatformFeatures = ({ ctx }: { ctx: TestContext }) => {
	const f = emailPlatformFeatureIds;
	const orgId = ctx.org.id;
	const env = ctx.env;

	return [
		constructMeteredFeature({
			featureId: f.emails,
			name: featureNames[f.emails],
			orgId,
			env,
			usageType: FeatureUsageType.Single,
			eventNames: ["emails"],
		}),
		constructMeteredFeature({
			featureId: f.automation_runs,
			name: featureNames[f.automation_runs],
			orgId,
			env,
			usageType: FeatureUsageType.Single,
			eventNames: ["automation_runs"],
		}),
		constructMeteredFeature({
			featureId: f.ai_actions,
			name: featureNames[f.ai_actions],
			orgId,
			env,
			usageType: FeatureUsageType.Single,
			eventNames: ["ai_actions"],
		}),
		constructCreditSystem({
			featureId: f.ai_credits,
			name: featureNames[f.ai_credits],
			orgId,
			env,
			schema: [{ metered_feature_id: f.ai_actions, credit_cost: 1 }],
		}),
		constructMeteredFeature({
			featureId: f.contacts,
			name: featureNames[f.contacts],
			orgId,
			env,
			usageType: FeatureUsageType.Continuous,
		}),
		constructMeteredFeature({
			featureId: f.domains,
			name: featureNames[f.domains],
			orgId,
			env,
			usageType: FeatureUsageType.Continuous,
		}),
		constructMeteredFeature({
			featureId: f.projects,
			name: featureNames[f.projects],
			orgId,
			env,
			usageType: FeatureUsageType.Continuous,
		}),
		...emailPlatformBooleanFeatureIds.map((featureId) =>
			constructBooleanFeature({
				featureId,
				name: featureNames[featureId],
				orgId,
				env,
			}),
		),
	];
};

export const ensureEmailPlatformFeatures = async ({
	ctx = defaultCtx,
}: {
	ctx?: TestContext;
} = {}) => {
	const desiredFeatures = buildEmailPlatformFeatures({ ctx });
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

export const buildEmailPlatformProducts = () => {
	const f = emailPlatformFeatureIds;
	const p = emailPlatformPlanIds;

	const freeBooleans = [...sharedBooleanFeatureIds, f.ticket_support] as const;
	const proBooleans = [
		...sharedBooleanFeatureIds,
		f.ticket_support,
		f.no_daily_limit,
	] as const;
	const scaleBooleans = [
		...sharedBooleanFeatureIds,
		f.slack_support,
		f.no_daily_limit,
	] as const;
	const enterpriseBooleans = [
		...sharedBooleanFeatureIds,
		f.priority_support,
		f.no_daily_limit,
		f.sso_saml,
		f.dedicated_ip,
	] as const;

	const transactionalPlan = (
		tier: TransactionalTier,
		booleans: typeof proBooleans | typeof scaleBooleans,
	) => ({
		...products.base({
			id: p[tier.key],
			items: [
				items.monthlyPrice({ price: tier.price }),
				...emailItems({
					includedEmails: tier.emails,
					overagePerThousand: tier.overagePerThousand,
				}),
				...automationItems(),
				items.free({
					featureId: f.ai_credits,
					includedUsage: tier.baseKey === "pro" ? 100 : 500,
				}),
				items.free({
					featureId: f.domains,
					includedUsage: tier.baseKey === "pro" ? 10 : 1_000,
				}),
				...booleanItems(booleans),
			],
		}),
		name: tier.name,
	});

	const marketingPlan = (tier: MarketingTier) => ({
		...products.base({
			id: p[tier.key],
			items: [
				items.monthlyPrice({ price: tier.price }),
				items.free({
					featureId: f.contacts,
					includedUsage: tier.contacts,
				}),
				items.free({ featureId: f.ai_credits, includedUsage: 100 }),
				...booleanItems([...sharedBooleanFeatureIds, f.no_daily_limit]),
			],
		}),
		name: tier.name,
	});

	const transactionalPlans = Object.fromEntries(
		transactionalTiers.map((tier) => [
			tier.key,
			transactionalPlan(
				tier,
				tier.baseKey === "pro" ? proBooleans : scaleBooleans,
			),
		]),
	) as Record<TransactionalTier["key"], ProductV2>;
	const marketingPlans = Object.fromEntries(
		marketingTiers.map((tier) => [tier.key, marketingPlan(tier)]),
	) as Record<MarketingTier["key"], ProductV2>;

	const basePlans = {
		free: products.base({
			id: p.free,
			items: [
				items.free({ featureId: f.emails, includedUsage: 3_000 }),
				items.free({ featureId: f.automation_runs, includedUsage: 10_000 }),
				items.free({ featureId: f.ai_credits, includedUsage: 5 }),
				items.free({ featureId: f.domains, includedUsage: 1 }),
				...booleanItems(freeBooleans),
			],
		}),
		pro: transactionalPlans.pro,
		scale: transactionalPlans.scale,
		proMarketing: marketingPlans.proMarketing,
		enterprise: products.base({
			id: p.enterprise,
			items: [
				items.free({ featureId: f.emails, includedUsage: 3_000_000 }),
				...automationItems(),
				items.free({ featureId: f.ai_credits, includedUsage: 5_000 }),
				items.free({ featureId: f.domains, includedUsage: 5_000 }),
				items.free({ featureId: f.contacts, includedUsage: 150_000 }),
				...booleanItems(enterpriseBooleans),
			],
		}),
		dedicatedIpPack: {
			...products.base({
				id: p.dedicatedIpPack,
				isAddOn: true,
				items: [items.monthlyPrice({ price: 30 }), booleanItem(f.dedicated_ip)],
			}),
			name: "Dedicated IP Pack",
		},
	} satisfies Record<string, ProductV2>;
	const variantPlans = {
		pro100k: transactionalPlans.pro100k,
		scale200k: transactionalPlans.scale200k,
		scale500k: transactionalPlans.scale500k,
		scale1m: transactionalPlans.scale1m,
		scale1_5m: transactionalPlans.scale1_5m,
		scale2_5m: transactionalPlans.scale2_5m,
		proMarketing10k: marketingPlans.proMarketing10k,
		proMarketing15k: marketingPlans.proMarketing15k,
		proMarketing25k: marketingPlans.proMarketing25k,
		proMarketing50k: marketingPlans.proMarketing50k,
		proMarketing100k: marketingPlans.proMarketing100k,
		proMarketing150k: marketingPlans.proMarketing150k,
	} satisfies Record<string, ProductV2>;
	const variantPlanConfigs = [
		{ key: "pro100k", baseKey: "pro", name: "Pro 100k" },
		{ key: "scale200k", baseKey: "scale", name: "Scale 200k" },
		{ key: "scale500k", baseKey: "scale", name: "Scale 500k" },
		{ key: "scale1m", baseKey: "scale", name: "Scale 1m" },
		{ key: "scale1_5m", baseKey: "scale", name: "Scale 1.5m" },
		{ key: "scale2_5m", baseKey: "scale", name: "Scale 2.5m" },
		{
			key: "proMarketing10k",
			baseKey: "proMarketing",
			name: "Pro Marketing 10k",
		},
		{
			key: "proMarketing15k",
			baseKey: "proMarketing",
			name: "Pro Marketing 15k",
		},
		{
			key: "proMarketing25k",
			baseKey: "proMarketing",
			name: "Pro Marketing 25k",
		},
		{
			key: "proMarketing50k",
			baseKey: "proMarketing",
			name: "Pro Marketing 50k",
		},
		{
			key: "proMarketing100k",
			baseKey: "proMarketing",
			name: "Pro Marketing 100k",
		},
		{
			key: "proMarketing150k",
			baseKey: "proMarketing",
			name: "Pro Marketing 150k",
		},
	] satisfies {
		key: keyof typeof variantPlans;
		baseKey: keyof typeof basePlans;
		name: string;
	}[];
	const plans = {
		...basePlans,
		...variantPlans,
	};

	return {
		featureIds: emailPlatformFeatureIds,
		planIds: emailPlatformPlanIds,
		proBooleans,
		scaleBooleans,
		enterpriseBooleans,
		basePlans,
		variantPlans,
		variantPlanConfigs,
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

type EmailPlatformCatalog = ReturnType<typeof buildEmailPlatformProducts>;

const resolveVariantPlanId = ({
	basePlanId,
	basePlanKey,
	variantPlanId,
}: {
	basePlanId: string;
	basePlanKey: string;
	variantPlanId: string;
}) => {
	const prefix = `${basePlanKey}_`;
	return basePlanId.startsWith(prefix)
		? `${variantPlanId}_${basePlanId.slice(prefix.length)}`
		: variantPlanId;
};

export const createEmailPlatformVariants = async ({
	ctx = defaultCtx,
	catalog = buildEmailPlatformProducts(),
}: {
	ctx?: TestContext;
	catalog?: EmailPlatformCatalog;
} = {}) => {
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});

	for (const config of catalog.variantPlanConfigs) {
		const basePlan = catalog.basePlans[config.baseKey];
		const variantPlan = catalog.variantPlans[config.key];
		const variantPlanId = resolveVariantPlanId({
			basePlanId: basePlan.id,
			basePlanKey: config.baseKey,
			variantPlanId: variantPlan.id,
		});

		variantPlan.id = variantPlanId;
		variantPlan.name = config.name;

		try {
			await rpc.plans.delete(variantPlanId, { allVersions: true });
		} catch {}

		try {
			await rpc.post("/plans.create_variant", {
				base_plan_id: basePlan.id,
				variant_plan_id: variantPlanId,
				name: variantPlan.name,
			});
		} catch (error) {
			if ((error as { code?: string }).code !== "product_id_already_exists") {
				throw error;
			}
		}

		const update = productItemsToPlanUpdate({
			ctx,
			items: variantPlan.items,
		});

		await rpc.plans.update<unknown, RpcUpdatePlan>(variantPlanId, {
			name: variantPlan.name,
			...update,
		});
	}

	return catalog.variantPlans;
};

export const initEmailPlatformScenario = async ({
	customerId = "agent-email-platform",
	attachPlan = "free",
	entityCount = 2,
	paymentMethod = "success",
	ctx = defaultCtx,
}: {
	customerId?: string;
	attachPlan?: EmailPlatformPlanKey | null;
	entityCount?: number;
	paymentMethod?: "success" | "fail" | "authenticate" | "alipay";
	ctx?: TestContext;
} = {}) => {
	await ensureEmailPlatformFeatures({ ctx });

	const catalog = buildEmailPlatformProducts();
	const setup = [
		s.customer({ paymentMethod }),
		s.products({ list: Object.values(catalog.basePlans) }),
		...(entityCount > 0
			? [
					s.entities({
						count: entityCount,
						featureId: catalog.featureIds.projects,
					}),
				]
			: []),
	];
	const scenario = await initScenario({
		customerId,
		setup,
		actions: [],
		ctx,
	});
	await createEmailPlatformVariants({ ctx, catalog });

	if (attachPlan) {
		await scenario.autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: catalog.plans[attachPlan].id,
		});
		await timeout(5_000);
	}

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

export const seedEmailPlatformCustomers = async ({
	customerCount = 1_000,
	idPrefix = "ep-customer",
	entityCountForCustomer,
	productPrefix = "email-platform",
	attachPlan = null,
	concurrency = 10,
	deleteExisting = true,
	ctx = defaultCtx,
}: {
	customerCount?: number;
	idPrefix?: string;
	entityCountForCustomer?: (index: number) => 1 | 2;
	productPrefix?: string;
	attachPlan?: Extract<EmailPlatformPlanKey, "free" | "enterprise"> | null;
	concurrency?: number;
	deleteExisting?: boolean;
	ctx?: TestContext;
} = {}) => {
	await ensureEmailPlatformFeatures({ ctx });

	const catalog = buildEmailPlatformProducts();
	await initScenario({
		setup: [
			s.products({
				list: withProductGroup({
					products: Object.values(catalog.basePlans),
					group: productPrefix,
				}),
				prefix: "",
				createInStripe: false,
			}),
		],
		actions: [],
		ctx,
	});
	await createEmailPlatformVariants({ ctx, catalog });

	const customers = Array.from({ length: customerCount }, (_, index) => {
		return {
			...buildRealisticCustomerSeed({
				index,
				idPrefix,
				entityFeatureId: emailPlatformFeatureIds.projects,
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

export const runEmailPlatformSeed = async () => {
	const customerCount = Number(getArgValue("--count") ?? EP_SEED.customerCount);
	const concurrency = Number(
		getArgValue("--concurrency") ?? EP_SEED.concurrency,
	);
	const attachPlan = (getArgValue("--attach-plan") ??
		EP_SEED.attachPlan) as Extract<
		EmailPlatformPlanKey,
		"free" | "enterprise"
	> | null;
	if (!process.env.TESTS_ORG) {
		throw new Error("TESTS_ORG is required to seed email platform data");
	}

	if (EP_SEED.clear && !process.argv.includes("--skip-clear")) {
		await clearOrg({
			orgSlug: process.env.TESTS_ORG,
			env: AppEnv.Sandbox,
			// Reset the Stripe account by default so stale usage meters don't
			// collide on re-seed; pass --skip-stripe-reset to keep them (faster).
			// skipStripeReset: process.argv.includes("--skip-stripe-reset"),
			skipStripeReset: true,
		});
	}

	const ctx = await createTestContext();

	const result = await seedEmailPlatformCustomers({
		ctx,
		customerCount,
		concurrency,
		attachPlan: attachPlan ?? null,
		deleteExisting: !process.argv.includes("--keep-existing"),
	});

	console.log("Email platform seed complete", {
		customers: result.customerCount,
		entities: result.entityCount,
		productPrefix: result.productPrefix,
		attachPlan: attachPlan ?? null,
	});
};

if (import.meta.main) {
	runEmailPlatformSeed()
		.catch((error) => {
			console.error("Email platform seed failed:", error);
			process.exit(1);
		})
		.finally(() => {
			process.exit(0);
		});
}
