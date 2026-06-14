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

// ── Email platform seed config ──
// Modeled loosely on Resend's pricing with deliberately tweaked numbers and
// renamed feature flags so it is NOT an accurate mirror. Transactional plans have
// NO base price: email volume is a prepaid item (volume-priced tiers) plus a
// consumable overage. AI credits are a credit system.
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
	proMarketing: "pro_marketing",
	scale: "scale",
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

const booleanItem = (featureId: EmailPlatformFeatureId): ProductItem =>
	constructFeatureItem({
		featureId,
		isBoolean: true,
	}) as ProductItem;

const booleanItems = (featureIds: readonly EmailPlatformFeatureId[]) =>
	featureIds.map(booleanItem);

type VolumeTier = { amount: number; to: number | "inf"; flat_amount: number };

// Prepaid email volume (whole purchased quantity billed at the tier flat amount)
// plus a per-1k consumable overage for sends beyond the purchased volume.
const emailItems = ({
	tiers,
	overagePerThousand,
}: {
	tiers: VolumeTier[];
	overagePerThousand: number;
}) => [
	constructPrepaidItem({
		featureId: emailPlatformFeatureIds.emails,
		billingUnits: 1,
		includedUsage: 0,
		tierBehaviour: TierBehavior.VolumeBased,
		tiers,
	}) as ProductItem,
	items.consumable({
		featureId: emailPlatformFeatureIds.emails,
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

const proEmailTiers: VolumeTier[] = [
	{ amount: 0, to: 50_000, flat_amount: 20 },
	{ amount: 0, to: 100_000, flat_amount: 35 },
	{ amount: 0, to: "inf", flat_amount: 60 },
];

const scaleEmailTiers: VolumeTier[] = [
	{ amount: 0, to: 100_000, flat_amount: 90 },
	{ amount: 0, to: 200_000, flat_amount: 160 },
	{ amount: 0, to: 500_000, flat_amount: 350 },
	{ amount: 0, to: 1_000_000, flat_amount: 650 },
	{ amount: 0, to: 1_500_000, flat_amount: 825 },
	{ amount: 0, to: 2_500_000, flat_amount: 1_150 },
	{ amount: 0, to: "inf", flat_amount: 1_500 },
];

// Marketing is capped by contacts, not emails: prepaid contact tiers, no overage.
const marketingContactTiers: VolumeTier[] = [
	{ amount: 0, to: 5_000, flat_amount: 40 },
	{ amount: 0, to: 10_000, flat_amount: 80 },
	{ amount: 0, to: 15_000, flat_amount: 120 },
	{ amount: 0, to: 25_000, flat_amount: 180 },
	{ amount: 0, to: 50_000, flat_amount: 250 },
	{ amount: 0, to: 100_000, flat_amount: 450 },
	{ amount: 0, to: 150_000, flat_amount: 650 },
	{ amount: 0, to: "inf", flat_amount: 900 },
];

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

	const plans = {
		// Free: fixed allowances, daily-limited, no overage on automations.
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
		// Pro/Scale: NO base price — email volume is the prepaid item.
		pro: products.base({
			id: p.pro,
			items: [
				...emailItems({ tiers: proEmailTiers, overagePerThousand: 0.9 }),
				...automationItems(),
				items.free({ featureId: f.ai_credits, includedUsage: 100 }),
				items.free({ featureId: f.domains, includedUsage: 10 }),
				...booleanItems(proBooleans),
			],
		}),
		scale: products.base({
			id: p.scale,
			items: [
				...emailItems({ tiers: scaleEmailTiers, overagePerThousand: 0.5 }),
				...automationItems(),
				items.free({ featureId: f.ai_credits, includedUsage: 500 }),
				items.free({ featureId: f.domains, includedUsage: 1_000 }),
				...booleanItems(scaleBooleans),
			],
		}),
		// Marketing: capped by contacts (prepaid tiers), not email volume.
		proMarketing: products.base({
			id: p.proMarketing,
			items: [
				constructPrepaidItem({
					featureId: f.contacts,
					billingUnits: 1,
					includedUsage: 0,
					tierBehaviour: TierBehavior.VolumeBased,
					tiers: marketingContactTiers,
				}) as ProductItem,
				items.free({ featureId: f.ai_credits, includedUsage: 100 }),
				...booleanItems([...sharedBooleanFeatureIds, f.no_daily_limit]),
			],
		}),
		// Enterprise: custom, no base price, flexible everything.
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

	return {
		featureIds: emailPlatformFeatureIds,
		planIds: emailPlatformPlanIds,
		proBooleans,
		scaleBooleans,
		enterpriseBooleans,
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
		s.products({ list: Object.values(catalog.plans) }),
		...(entityCount > 0
			? [
					s.entities({
						count: entityCount,
						featureId: catalog.featureIds.projects,
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
