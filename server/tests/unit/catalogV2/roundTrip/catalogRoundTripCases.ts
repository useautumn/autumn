import {
	AllocatedBillingBehavior,
	AllowanceType,
	BillingInterval,
	BillWhen,
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	FeatureUsageType,
	FreeTrialDuration,
	type FullProduct,
	OnDecrease,
	OnIncrease,
	type Price,
	PriceType,
	RolloverExpiryDurationType,
	TierBehavior,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import type { RoundTripOrg } from "./catalogRoundTrip";

/**
 * Rows as they exist in real orgs — including shapes written under older
 * derivation rules. GET → preview_update on any of them must be a no-op.
 *
 * Each table below owns one field family the comparators know about
 * (`entsAreSame`, `pricesAreSame`, `diffProductDetails`, free trial). A new
 * comparator field belongs in a table here, with a legacy shape if one exists.
 */

const metered = ({
	id,
	usageType,
	config = {},
}: {
	id: string;
	usageType: FeatureUsageType;
	config?: Record<string, unknown>;
}) =>
	features.create({
		id,
		internalId: `fe_${id}`,
		name: id,
		config: { usage_type: usageType, ...config },
	});

const boolean = ({
	id,
	config = {},
}: {
	id: string;
	config?: Record<string, unknown>;
}) =>
	features.create({
		id,
		internalId: `fe_${id}`,
		name: id,
		type: FeatureType.Boolean,
		config,
	});

const creditSystem = ({
	id,
	schema,
}: {
	id: string;
	schema: { metered_feature_id: string; credit_amount: number }[];
}) =>
	features.create({
		id,
		internalId: `fe_${id}`,
		name: id,
		type: FeatureType.CreditSystem,
		config: {
			usage_type: FeatureUsageType.Single,
			schema: schema.map((entry) => ({ ...entry, feature_amount: 1 })),
		},
	});

const consumable = (id: string) =>
	metered({ id, usageType: FeatureUsageType.Single });
const allocated = (id: string) =>
	metered({ id, usageType: FeatureUsageType.Continuous });

const ent = ({
	feature,
	overrides = {},
}: {
	feature: Feature;
	overrides?: Partial<EntitlementWithFeature>;
}): EntitlementWithFeature =>
	entitlements.buildWithFeature({
		id: `ent_${feature.id}`,
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		feature,
		...(feature.type === FeatureType.Boolean
			? { allowance: null, allowance_type: null, interval: null }
			: {}),
		...overrides,
	});

const usagePrice = ({
	feature,
	entitlement,
	config = {},
	overrides = {},
}: {
	feature: Feature;
	entitlement: EntitlementWithFeature;
	config?: Partial<UsagePriceConfig>;
	overrides?: Partial<Price>;
}) =>
	prices.buildUsage({
		overrides: {
			id: `pr_${feature.id}`,
			entitlement_id: entitlement.id,
			...overrides,
		},
		configOverrides: {
			internal_feature_id: feature.internal_id,
			feature_id: feature.id,
			interval: BillingInterval.Month,
			usage_tiers: [{ to: TierInfinite, amount: 10 }],
			...config,
		},
	});

const plan = ({
	id,
	ents,
	planPrices = [],
	overrides = {},
}: {
	id: string;
	ents: EntitlementWithFeature[];
	planPrices?: Price[];
	overrides?: Partial<FullProduct>;
}): FullProduct => ({
	...products.createFull({ id, entitlements: ents, prices: planPrices }),
	...overrides,
});

export type FeatureCase = { name: string; feature: Feature };
export type PlanCase = {
	name: string;
	product: FullProduct;
	features: Feature[];
	org?: RoundTripOrg;
};

/** One-item plan: the common shape for a price/entitlement case. */
const itemPlan = ({
	name,
	feature,
	entOverrides = {},
	price,
	org,
}: {
	name: string;
	feature: Feature;
	entOverrides?: Partial<EntitlementWithFeature>;
	price?: (entitlement: EntitlementWithFeature) => Price;
	org?: RoundTripOrg;
}): PlanCase => {
	const entitlement = ent({ feature, overrides: entOverrides });
	return {
		name,
		product: plan({
			id: "pro",
			ents: [entitlement],
			planPrices: price ? [price(entitlement)] : [],
		}),
		features: [feature],
		...(org ? { org } : {}),
	};
};

const seats = allocated("seats");
const messages = consumable("messages");

export const featureCases: FeatureCase[] = [
	{ name: "metered consumable", feature: consumable("messages") },
	{ name: "metered allocated", feature: allocated("seats") },
	{ name: "boolean", feature: boolean({ id: "sso" }) },
	{
		name: "legacy: boolean row still carrying a metered usage_type",
		feature: boolean({
			id: "webhooks",
			config: { usage_type: FeatureUsageType.Single },
		}),
	},
	{
		name: "metered with event names",
		feature: {
			...consumable("actions"),
			event_names: ["action.created", "action.retried"],
		},
	},
	{
		name: "credit system",
		feature: creditSystem({
			id: "credits",
			schema: [{ metered_feature_id: "actions", credit_amount: 2 }],
		}),
	},
];

const entityScoped = (): PlanCase => {
	const projects = allocated("projects");
	const seatsEnt = ent({
		feature: seats,
		overrides: {
			allowance: 3,
			interval: EntInterval.Lifetime,
			entity_feature_id: projects.id,
		},
	});
	return {
		name: "entity-scoped allocated item",
		product: plan({ id: "pro", ents: [seatsEnt] }),
		features: [seats, projects],
	};
};

const creditOverride = (): PlanCase => {
	const actions = consumable("actions");
	const credits = creditSystem({
		id: "credits",
		schema: [{ metered_feature_id: actions.id, credit_amount: 2 }],
	});
	const creditsEnt = ent({
		feature: credits,
		overrides: {
			allowance: 500,
			interval: EntInterval.Month,
			feature_override: {
				schema: [
					{
						metered_feature_id: actions.id,
						feature_amount: 1,
						credit_amount: 4,
					},
				],
			},
		},
	});
	return {
		name: "credit system item with a schema override",
		product: plan({ id: "pro", ents: [creditsEnt] }),
		features: [actions, credits],
	};
};

export const entitlementCases: PlanCase[] = [
	itemPlan({
		name: "consumable with a monthly reset",
		feature: messages,
		entOverrides: { allowance: 1000, interval: EntInterval.Month },
	}),
	itemPlan({
		name: "consumable with a quarterly reset (interval_count)",
		feature: messages,
		entOverrides: {
			allowance: 1000,
			interval: EntInterval.Month,
			interval_count: 3,
		},
	}),
	itemPlan({
		name: "allocated, lifetime, as written today (carry_from_previous: true)",
		feature: seats,
		entOverrides: {
			allowance: 5,
			interval: EntInterval.Lifetime,
			carry_from_previous: true,
		},
	}),
	itemPlan({
		name: "legacy: allocated, lifetime, written with carry_from_previous: false",
		feature: seats,
		entOverrides: {
			allowance: 5,
			interval: EntInterval.Lifetime,
			carry_from_previous: false,
		},
	}),
	itemPlan({
		name: "unlimited allocated",
		feature: seats,
		entOverrides: {
			allowance: null,
			allowance_type: AllowanceType.Unlimited,
			interval: EntInterval.Lifetime,
		},
	}),
	itemPlan({
		name: "pooled consumable",
		feature: messages,
		entOverrides: {
			allowance: 100,
			interval: EntInterval.Month,
			pooled: true,
		},
	}),
	itemPlan({
		name: "consumable with rollover (max)",
		feature: messages,
		entOverrides: {
			allowance: 100,
			interval: EntInterval.Month,
			rollover: {
				max: 300,
				max_percentage: null,
				duration: RolloverExpiryDurationType.Month,
				length: 2,
			},
		},
	}),
	itemPlan({
		name: "consumable with rollover (max_percentage, forever)",
		feature: messages,
		entOverrides: {
			allowance: 100,
			interval: EntInterval.Month,
			rollover: {
				max: null,
				max_percentage: 50,
				duration: RolloverExpiryDurationType.Forever,
				length: 1,
			},
		},
	}),
	itemPlan({
		name: "boolean item",
		feature: boolean({ id: "sso" }),
	}),
	itemPlan({
		name: "legacy: boolean item whose feature still carries a metered usage_type",
		feature: boolean({
			id: "webhooks",
			config: { usage_type: FeatureUsageType.Single },
		}),
	}),
	entityScoped(),
	creditOverride(),
];

export const priceCases: PlanCase[] = [
	itemPlan({
		name: "consumable pay-per-use, flat amount",
		feature: messages,
		entOverrides: { allowance: 100, interval: EntInterval.Month },
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				config: { usage_tiers: [{ to: TierInfinite, amount: 0.5 }] },
			}),
	}),
	itemPlan({
		name: "consumable pay-per-use with billing_units",
		feature: messages,
		entOverrides: { allowance: 1000, interval: EntInterval.Month },
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				config: {
					billing_units: 1000,
					usage_tiers: [{ to: TierInfinite, amount: 0.9 }],
				},
			}),
	}),
	itemPlan({
		name: "consumable pay-per-use, yearly with interval_count",
		feature: messages,
		entOverrides: {
			allowance: 100,
			interval: EntInterval.Year,
			interval_count: 2,
		},
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				config: { interval: BillingInterval.Year, interval_count: 2 },
			}),
	}),
	itemPlan({
		name: "consumable pay-per-use, graduated tiers",
		feature: messages,
		entOverrides: { allowance: 0, interval: EntInterval.Month },
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				overrides: { tier_behavior: TierBehavior.Graduated },
				config: {
					usage_tiers: [
						{ to: 1000, amount: 1 },
						{ to: TierInfinite, amount: 0.5 },
					],
				},
			}),
	}),
	itemPlan({
		name: "prepaid, volume tiers with flat amounts",
		feature: messages,
		entOverrides: { allowance: 0, interval: EntInterval.Month },
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				overrides: {
					tier_behavior: TierBehavior.VolumeBased,
					proration_config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.ProrateImmediately,
					},
				},
				config: {
					bill_when: BillWhen.StartOfPeriod,
					usage_tiers: [
						{ to: 1000, amount: 0, flat_amount: 200 },
						{ to: TierInfinite, amount: 0, flat_amount: 600 },
					],
				},
			}),
	}),
	itemPlan({
		name: "legacy: single tier stored as volume (unobservable, collapses to flat)",
		feature: messages,
		entOverrides: { allowance: 100, interval: EntInterval.Month },
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				overrides: { tier_behavior: TierBehavior.VolumeBased },
				config: { usage_tiers: [{ to: TierInfinite, amount: 0.5 }] },
			}),
	}),
	itemPlan({
		name: "consumable pay-per-use with threshold billing",
		feature: messages,
		entOverrides: { allowance: 0, interval: EntInterval.Month },
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				config: { threshold_billing: { threshold: 500 } },
			}),
	}),
	itemPlan({
		name: "consumable pay-per-use with additional currencies",
		feature: messages,
		org: { multiCurrency: true },
		entOverrides: { allowance: 0, interval: EntInterval.Month },
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				config: {
					base_currency: "usd",
					currencies: {
						eur: { usage_tiers: [{ to: TierInfinite, amount: 9 }] },
					},
				},
			}),
	}),
	// Prepaid lifetime rows are written with should_prorate: true.
	itemPlan({
		name: "prepaid seats, default proration",
		feature: seats,
		entOverrides: { allowance: 0, interval: EntInterval.Lifetime },
		price: (entitlement) =>
			usagePrice({
				feature: seats,
				entitlement,
				config: { bill_when: BillWhen.StartOfPeriod, should_prorate: true },
				overrides: {
					proration_config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.ProrateImmediately,
					},
				},
			}),
	}),
	itemPlan({
		name: "prepaid seats, custom proration (prorate_next_cycle / none)",
		feature: seats,
		entOverrides: { allowance: 0, interval: EntInterval.Lifetime },
		price: (entitlement) =>
			usagePrice({
				feature: seats,
				entitlement,
				config: { bill_when: BillWhen.StartOfPeriod, should_prorate: true },
				overrides: {
					proration_config: {
						on_increase: OnIncrease.ProrateNextCycle,
						on_decrease: OnDecrease.None,
					},
				},
			}),
	}),
	itemPlan({
		name: "prepaid consumable with max_purchase",
		feature: messages,
		entOverrides: {
			allowance: 0,
			interval: EntInterval.Month,
			usage_limit: 5000,
		},
		price: (entitlement) =>
			usagePrice({
				feature: messages,
				entitlement,
				config: { bill_when: BillWhen.StartOfPeriod, billing_units: 100 },
				overrides: {
					proration_config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.ProrateImmediately,
					},
				},
			}),
	}),
	itemPlan({
		name: "allocated pay-per-use billed in arrear (v2 row)",
		feature: seats,
		entOverrides: { allowance: 0, interval: EntInterval.Lifetime },
		price: (entitlement) =>
			usagePrice({
				feature: seats,
				entitlement,
				config: {
					should_prorate: false,
					allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
				},
			}),
	}),
	itemPlan({
		name: "allocated pay-per-use billed in arrear (no proration flag, no behavior)",
		feature: seats,
		entOverrides: { allowance: 0, interval: EntInterval.Lifetime },
		price: (entitlement) =>
			usagePrice({
				feature: seats,
				entitlement,
				config: { should_prorate: false },
			}),
	}),
	// Legacy prorated rows carry their knobs on the wire; both variants must
	// round-trip, since the knobs decide the mid-cycle charge.
	...[
		{
			label: "default knobs",
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
		{
			label: "bill_immediately / none",
			on_increase: OnIncrease.BillImmediately,
			on_decrease: OnDecrease.None,
		},
	].map(({ label, on_increase, on_decrease }) =>
		itemPlan({
			name: `legacy: allocated pay-per-use, prorated (${label})`,
			feature: seats,
			entOverrides: { allowance: 0, interval: EntInterval.Lifetime },
			price: (entitlement) =>
				usagePrice({
					feature: seats,
					entitlement,
					config: { should_prorate: true },
					overrides: { proration_config: { on_increase, on_decrease } },
				}),
		}),
	),
];

const fixed = ({
	amount,
	interval = BillingInterval.Month,
	intervalCount = 1,
}: {
	amount: number;
	interval?: BillingInterval;
	intervalCount?: number;
}) =>
	prices.buildFixed({
		overrides: { id: "pr_base" },
		configOverrides: {
			amount,
			type: PriceType.Fixed,
			interval,
			interval_count: intervalCount,
		},
	});

export const planDetailCases: PlanCase[] = [
	{
		name: "fixed base price",
		product: plan({
			id: "pro",
			ents: [],
			planPrices: [fixed({ amount: 40 })],
		}),
		features: [],
	},
	{
		name: "fixed base price, every 3 months",
		product: plan({
			id: "pro",
			ents: [],
			planPrices: [fixed({ amount: 100, intervalCount: 3 })],
		}),
		features: [],
	},
	{
		name: "free plan with no items",
		product: plan({ id: "free", ents: [] }),
		features: [],
	},
	{
		name: "add-on",
		product: plan({ id: "boost", ents: [], overrides: { is_add_on: true } }),
		features: [],
	},
	{
		name: "auto-enable (is_default)",
		product: plan({ id: "free", ents: [], overrides: { is_default: true } }),
		features: [],
	},
	{
		name: "description and group",
		product: plan({
			id: "pro",
			ents: [],
			overrides: { description: "For teams", group: "core" },
		}),
		features: [],
	},
	{
		name: "free trial, card required",
		product: plan({
			id: "pro",
			ents: [],
			planPrices: [fixed({ amount: 40 })],
			overrides: {
				free_trial: {
					id: "ft_pro",
					internal_product_id: "internal_pro",
					created_at: 1_800_000_000_000,
					is_custom: false,
					duration: FreeTrialDuration.Day,
					length: 14,
					unique_fingerprint: false,
					card_required: true,
					on_end: null,
				},
			},
		}),
		features: [],
	},
	{
		name: "free trial, no card, unique fingerprint",
		product: plan({
			id: "pro",
			ents: [],
			planPrices: [fixed({ amount: 40 })],
			overrides: {
				free_trial: {
					id: "ft_pro",
					internal_product_id: "internal_pro",
					created_at: 1_800_000_000_000,
					is_custom: false,
					duration: FreeTrialDuration.Month,
					length: 1,
					unique_fingerprint: true,
					card_required: false,
					on_end: null,
				},
			},
		}),
		features: [],
	},
];

/**
 * Several rows on one plan: pairing by feature, base price beside items, and
 * emitted order all have to survive when there is more than one of anything.
 */
const realisticPlan = (): PlanCase => {
	const sso = boolean({ id: "sso" });
	const actions = consumable("actions");
	const credits = creditSystem({
		id: "credits",
		schema: [{ metered_feature_id: actions.id, credit_amount: 1 }],
	});
	const messagesEnt = ent({
		feature: messages,
		overrides: { allowance: 1000, interval: EntInterval.Month },
	});
	const seatsEnt = ent({
		feature: seats,
		overrides: { allowance: 3, interval: EntInterval.Lifetime },
	});
	const creditsEnt = ent({
		feature: credits,
		overrides: { allowance: 500, interval: EntInterval.Month },
	});
	const ssoEnt = ent({ feature: sso });
	return {
		name: "base price + free, metered, prepaid, credit and boolean items",
		product: plan({
			id: "pro",
			ents: [messagesEnt, seatsEnt, creditsEnt, ssoEnt],
			planPrices: [
				fixed({ amount: 40 }),
				usagePrice({
					feature: messages,
					entitlement: messagesEnt,
					config: {
						billing_units: 1000,
						usage_tiers: [{ to: TierInfinite, amount: 0.9 }],
					},
				}),
				usagePrice({
					feature: seats,
					entitlement: seatsEnt,
					config: { bill_when: BillWhen.StartOfPeriod, should_prorate: true },
					overrides: {
						proration_config: {
							on_increase: OnIncrease.ProrateImmediately,
							on_decrease: OnDecrease.ProrateImmediately,
						},
					},
				}),
			],
		}),
		features: [messages, seats, actions, credits, sso],
	};
};

const twoAllocatedShapes = (): PlanCase => {
	const projects = allocated("projects");
	const seatsEnt = ent({
		feature: seats,
		overrides: { allowance: 1, interval: EntInterval.Lifetime },
	});
	const projectsEnt = ent({
		feature: projects,
		overrides: { allowance: 1, interval: EntInterval.Lifetime },
	});
	return {
		name: "legacy prorated and v2 arrear allocated items side by side",
		product: plan({
			id: "seats_mixed",
			ents: [seatsEnt, projectsEnt],
			planPrices: [
				usagePrice({
					feature: seats,
					entitlement: seatsEnt,
					config: { should_prorate: true },
					overrides: {
						proration_config: {
							on_increase: OnIncrease.BillImmediately,
							on_decrease: OnDecrease.None,
						},
					},
				}),
				usagePrice({
					feature: projects,
					entitlement: projectsEnt,
					config: {
						should_prorate: false,
						allocated_billing_behavior: AllocatedBillingBehavior.Arrear,
					},
				}),
			],
		}),
		features: [seats, projects],
	};
};

export const multiItemCases: PlanCase[] = [
	realisticPlan(),
	twoAllocatedShapes(),
];

export const planCaseGroups: { name: string; cases: PlanCase[] }[] = [
	{ name: "entitlement fields", cases: entitlementCases },
	{ name: "price fields", cases: priceCases },
	{ name: "plan details", cases: planDetailCases },
	{ name: "multiple items", cases: multiItemCases },
];
