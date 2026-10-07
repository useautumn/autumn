import {
	BillingInterval,
	BillingMethod,
	type CreateInvoiceParamsInput,
	type ProductItem,
	ProductItemInterval,
	TierBehavior,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import {
	constructArrearItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";
import {
	type OracleInterval,
	type OracleLine,
	type OraclePeriod,
	type OraclePrice,
	type OracleTier,
	oracleProrate,
	oracleQuantityToAmount,
	roundToCents,
} from "./invoiceOracle";

type PlanParams = NonNullable<CreateInvoiceParamsInput["plans"]>[number];
type CustomizeItem = NonNullable<
	NonNullable<PlanParams["customize"]>["items"]
>[number];
type ItemPrice = NonNullable<CustomizeItem["price"]>;
type FeatureEntry = NonNullable<PlanParams["feature_quantities"]>[number];

export type InvalidMutation =
	| "behavior_mismatch_new_feature"
	| "unpriced_feature"
	| "quantity_and_usage"
	| "negative_quantity"
	| "negative_base_amount"
	| "negative_item_amount"
	| "negative_tier_amount"
	| "zero_billing_units"
	| "amount_and_tiers"
	| "flat_amount_on_graduated"
	| "volume_usage_based"
	| "unsorted_tiers"
	| "missing_inf_tier"
	| "duplicate_item";

type PriceShape = OraclePrice & {
	behavior: BillingMethod;
	amount?: number;
};

type CatalogItem = { featureId: string; included: number; price: PriceShape };

export type FuzzCatalog = {
	base: { amount: number; interval: OracleInterval } | null;
	items: CatalogItem[];
};

export type FuzzExpectation =
	| { kind: "lines"; lines: OracleLine[]; total: number }
	| { kind: "invalid"; reason: string };

export type FuzzScenario = {
	seed: number;
	productId: string;
	catalog: FuzzCatalog;
	plan: Omit<PlanParams, "plan_id">;
	period?: OraclePeriod;
	expected: FuzzExpectation;
	summary: string;
};

const SINGLE_USE_FEATURES = [
	TestFeature.Messages,
	TestFeature.Words,
	TestFeature.Storage,
];
const CONTINUOUS_FEATURES = [TestFeature.Users, TestFeature.Workflows];
const ALL_FEATURES = [...SINGLE_USE_FEATURES, ...CONTINUOUS_FEATURES];

const JAN_1 = Date.UTC(2026, 0, 1);
const PERIODS: OraclePeriod[] = [
	{ start: JAN_1, end: Date.UTC(2026, 0, 16) },
	{ start: JAN_1, end: Date.UTC(2026, 1, 1) },
	{ start: JAN_1, end: Date.UTC(2026, 2, 16) },
];

type Rng = {
	next: () => number;
	int: (min: number, max: number) => number;
	pick: <T>(values: readonly T[]) => T;
	chance: (probability: number) => boolean;
	shuffle: <T>(values: readonly T[]) => T[];
};

/** mulberry32: tiny, deterministic, good enough for scenario selection. */
const createRng = (seed: number): Rng => {
	let state = seed >>> 0;
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {
		next,
		int: (min, max) => min + Math.floor(next() * (max - min + 1)),
		pick: (values) => values[Math.floor(next() * values.length)],
		chance: (probability) => next() < probability,
		// Fisher–Yates: a fixed number of draws per shuffle, so a seed survives runtime sort changes.
		shuffle: (values) => {
			const shuffled = [...values];
			for (let index = shuffled.length - 1; index > 0; index--) {
				const swap = Math.floor(next() * (index + 1));
				[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
			}
			return shuffled;
		},
	};
};

const genTiers = ({
	rng,
	billingUnits,
	volume,
}: {
	rng: Rng;
	billingUnits: number;
	volume: boolean;
}): OracleTier[] => {
	const first = billingUnits * rng.pick([2, 5, 10]);
	const bounds = rng.chance(0.5) ? [first, first * rng.pick([2, 4])] : [first];
	const topRate = rng.pick([2, 5, 10]);
	const tiers: OracleTier[] = [...bounds, "inf" as const].map((to, index) => ({
		to,
		amount: topRate / 2 ** index,
	}));
	if (!volume) return tiers;
	return tiers.map((tier) => {
		const flat = rng.pick([undefined, 0, 5, 20]);
		return flat === undefined ? tier : { ...tier, flat_amount: flat };
	});
};

const genPriceShape = ({
	rng,
	behavior,
	interval,
}: {
	rng: Rng;
	behavior: BillingMethod;
	interval: OracleInterval;
}): PriceShape => {
	const billingUnits = rng.pick([1, 1, 1, 10, 100]);
	const styles =
		behavior === BillingMethod.Prepaid
			? (["flat", "flat", "graduated", "volume"] as const)
			: (["flat", "flat", "graduated"] as const);
	const style = rng.pick(styles);
	if (style === "flat") {
		const amount = rng.pick([0.33, 0.5, 1, 2.5, 7.25, 10]);
		return {
			behavior,
			billingUnits,
			amount,
			tiers: [{ to: "inf", amount }],
			volume: false,
			interval,
		};
	}
	const volume = style === "volume";
	return {
		behavior,
		billingUnits,
		tiers: genTiers({ rng, billingUnits, volume }),
		volume,
		interval,
	};
};

const toProductItem = ({ featureId, included, price }: CatalogItem) => {
	const tiers = price.amount === undefined ? price.tiers : undefined;
	if (price.behavior === BillingMethod.Prepaid) {
		return constructPrepaidItem({
			featureId,
			price: price.amount,
			tiers,
			tierBehaviour: price.volume ? TierBehavior.VolumeBased : undefined,
			billingUnits: price.billingUnits,
			includedUsage: included,
		});
	}
	return constructArrearItem({
		featureId,
		price: price.amount,
		tiers,
		billingUnits: price.billingUnits,
		includedUsage: included,
		interval: ProductItemInterval.Month,
	});
};

export const catalogToProductItems = (catalog: FuzzCatalog): ProductItem[] => [
	...(catalog.base
		? [
				catalog.base.interval === "year"
					? items.annualPrice({ price: catalog.base.amount })
					: items.monthlyPrice({ price: catalog.base.amount }),
			]
		: []),
	...catalog.items.map(toProductItem),
];

const genCatalog = (rng: Rng): FuzzCatalog => {
	const base = rng.chance(0.6)
		? {
				amount: rng.pick([20, 49, 99.99, 250]),
				interval: rng.pick(["month", "month", "year"] as const),
			}
		: null;
	const featureIds = rng.shuffle(ALL_FEATURES).slice(0, rng.int(1, 3));
	const catalogItems = featureIds.map((featureId) => {
		const behavior = CONTINUOUS_FEATURES.includes(featureId)
			? BillingMethod.Prepaid
			: rng.pick([BillingMethod.Prepaid, BillingMethod.UsageBased]);
		const price = genPriceShape({ rng, behavior, interval: "month" });
		// Volume tiers would need the allowance-shifted boundaries; keep them allowance-free.
		const firstCeiling = price.tiers[0].to;
		const included =
			!price.volume && rng.chance(0.4)
				? price.billingUnits *
					(firstCeiling === "inf"
						? rng.int(1, 5)
						: rng.int(1, firstCeiling / price.billingUnits - 1))
				: 0;
		return { featureId, included, price };
	});
	return { base, items: catalogItems };
};

const shapeToRequestPrice = (shape: PriceShape): ItemPrice => ({
	billing_method: shape.behavior,
	interval:
		shape.interval === "year" ? BillingInterval.Year : BillingInterval.Month,
	billing_units: shape.billingUnits,
	...(shape.amount !== undefined
		? { amount: shape.amount }
		: {
				tiers: shape.tiers,
				tier_behavior: shape.volume
					? TierBehavior.VolumeBased
					: TierBehavior.Graduated,
			}),
});

const genQuantity = ({ rng, price }: { rng: Rng; price: PriceShape }) => {
	const boundary = price.tiers[0].to === "inf" ? undefined : price.tiers[0].to;
	const options = [
		() => 0,
		() => rng.int(1, price.billingUnits * 3),
		() => price.billingUnits * rng.int(200, 5000) + rng.int(0, 7),
		() => rng.int(1, 40) + 0.5,
		...(boundary !== undefined ? [() => boundary, () => boundary + 1] : []),
	];
	return rng.pick(options)();
};

type Draft = {
	plan: Omit<PlanParams, "plan_id">;
	overrides: Map<string, PriceShape>;
	invalidReason?: string;
};

const freeFeatureOf = ({
	catalog,
	draft,
}: {
	catalog: FuzzCatalog;
	draft: Draft;
}) =>
	ALL_FEATURES.find(
		(featureId) =>
			!catalog.items.some((item) => item.featureId === featureId) &&
			!draft.overrides.has(featureId),
	);

const opposite = (behavior: BillingMethod) =>
	behavior === BillingMethod.Prepaid
		? BillingMethod.UsageBased
		: BillingMethod.Prepaid;

/** Adds one request defect the API must reject with a 400. */
const applyInvalidMutation = ({
	rng,
	catalog,
	draft,
	mutation,
}: {
	rng: Rng;
	catalog: FuzzCatalog;
	draft: Draft;
	mutation: InvalidMutation;
}): boolean => {
	const plan = draft.plan;
	plan.customize = plan.customize ?? {};
	plan.customize.items = plan.customize.items ?? [];
	plan.feature_quantities = plan.feature_quantities ?? [];
	const customizeItems = plan.customize.items;
	const entries = plan.feature_quantities;
	const freeFeature = freeFeatureOf({ catalog, draft });
	const addOverridden = ({
		price,
		billingBehavior,
		quantity = 5,
	}: {
		price: ItemPrice;
		billingBehavior: BillingMethod;
		quantity?: number;
	}) => {
		if (!freeFeature) return false;
		customizeItems.push({ feature_id: freeFeature, price });
		entries.push({
			feature_id: freeFeature,
			billing_behavior: billingBehavior,
			quantity,
		});
		return true;
	};
	const flatPrice = (behavior: BillingMethod): ItemPrice => ({
		billing_method: behavior,
		interval: BillingInterval.Month,
		billing_units: 1,
		amount: 2,
	});
	const behavior = rng.pick([BillingMethod.Prepaid, BillingMethod.UsageBased]);

	switch (mutation) {
		case "behavior_mismatch_new_feature":
			return addOverridden({
				price: flatPrice(behavior),
				billingBehavior: opposite(behavior),
			});
		case "unpriced_feature":
			if (!freeFeature) return false;
			entries.push({
				feature_id: freeFeature,
				billing_behavior: behavior,
				quantity: 5,
			});
			return true;
		case "quantity_and_usage":
			if (!freeFeature) return false;
			entries.push({
				feature_id: freeFeature,
				billing_behavior: behavior,
				quantity: 5,
				usage: [{ feature_id: freeFeature, quantity: 5 }],
			} as FeatureEntry);
			return true;
		case "negative_quantity":
			return addOverridden({
				price: flatPrice(behavior),
				billingBehavior: behavior,
				quantity: -3,
			});
		case "negative_base_amount":
			plan.customize.price = { amount: -5, interval: BillingInterval.Month };
			return true;
		case "negative_item_amount":
			return addOverridden({
				price: { ...flatPrice(behavior), amount: -2 },
				billingBehavior: behavior,
			});
		case "negative_tier_amount":
			return addOverridden({
				price: {
					billing_method: behavior,
					interval: BillingInterval.Month,
					billing_units: 1,
					tier_behavior: TierBehavior.Graduated,
					tiers: [
						{ to: 10, amount: 1 },
						{ to: "inf", amount: -1 },
					],
				},
				billingBehavior: behavior,
				quantity: 20,
			});
		case "zero_billing_units":
			return addOverridden({
				price: { ...flatPrice(behavior), billing_units: 0 },
				billingBehavior: behavior,
			});
		case "amount_and_tiers":
			return addOverridden({
				price: {
					...flatPrice(behavior),
					tier_behavior: TierBehavior.Graduated,
					tiers: [
						{ to: 10, amount: 1 },
						{ to: "inf", amount: 0.5 },
					],
				},
				billingBehavior: behavior,
			});
		case "flat_amount_on_graduated":
			return addOverridden({
				price: {
					billing_method: behavior,
					interval: BillingInterval.Month,
					billing_units: 1,
					tier_behavior: TierBehavior.Graduated,
					tiers: [
						{ to: 10, amount: 1, flat_amount: 50 },
						{ to: "inf", amount: 0.5, flat_amount: 50 },
					],
				},
				billingBehavior: behavior,
			});
		case "unsorted_tiers":
		case "missing_inf_tier":
			return addOverridden({
				price: {
					billing_method: behavior,
					interval: BillingInterval.Month,
					billing_units: 1,
					tier_behavior: TierBehavior.Graduated,
					tiers:
						mutation === "unsorted_tiers"
							? [
									{ to: 100, amount: 1 },
									{ to: 50, amount: 2 },
									{ to: "inf", amount: 3 },
								]
							: [{ to: 100, amount: 1 }],
				},
				billingBehavior: behavior,
				quantity: 200,
			});
		case "duplicate_item":
			if (
				!addOverridden({
					price: flatPrice(behavior),
					billingBehavior: behavior,
				})
			)
				return false;
			customizeItems.push({ ...customizeItems[customizeItems.length - 1] });
			return true;
		case "volume_usage_based":
			return addOverridden({
				price: {
					billing_method: BillingMethod.UsageBased,
					interval: BillingInterval.Month,
					billing_units: 1,
					tier_behavior: TierBehavior.VolumeBased,
					tiers: [
						{ to: 10, amount: 1 },
						{ to: "inf", amount: 0.5 },
					],
				},
				billingBehavior: BillingMethod.UsageBased,
			});
	}
};

const resolveExpectedPrice = ({
	catalog,
	overrides,
	featureId,
	behavior,
}: {
	catalog: FuzzCatalog;
	overrides: Map<string, PriceShape>;
	featureId: string;
	behavior: BillingMethod;
}): OraclePrice | undefined => {
	const catalogItem = catalog.items.find(
		(item) => item.featureId === featureId && item.price.behavior === behavior,
	);
	const override = overrides.get(featureId);
	if (catalogItem) return override ?? catalogItem.price;
	return override?.behavior === behavior ? override : undefined;
};

const computeExpectation = ({
	catalog,
	draft,
	period,
}: {
	catalog: FuzzCatalog;
	draft: Draft;
	period?: OraclePeriod;
}): FuzzExpectation => {
	if (draft.invalidReason)
		return { kind: "invalid", reason: draft.invalidReason };
	const { plan } = draft;
	const lines: OracleLine[] = [];

	const customPrice = plan.customize?.price;
	const base =
		customPrice === undefined
			? catalog.base
			: customPrice === null || customPrice.amount === 0
				? null
				: {
						amount: customPrice.amount,
						interval: (customPrice.interval === BillingInterval.Year
							? "year"
							: "month") as OracleInterval,
					};
	if (base) {
		const prorate = plan.prorate ?? true;
		lines.push({
			featureId: null,
			quantity: null,
			amount: prorate
				? oracleProrate({
						amount: base.amount,
						interval: base.interval,
						period,
					})
				: base.amount,
			prorated: prorate && Boolean(period),
		});
	}

	for (const entry of plan.feature_quantities ?? []) {
		const hasCatalogPrice = catalog.items.some(
			(item) =>
				item.featureId === entry.feature_id &&
				item.price.behavior === entry.billing_behavior,
		);
		const override = draft.overrides.get(entry.feature_id);
		if (
			hasCatalogPrice &&
			override &&
			override.behavior !== entry.billing_behavior
		)
			return {
				kind: "invalid",
				reason: `override method for ${entry.feature_id}`,
			};
		const price = resolveExpectedPrice({
			catalog,
			overrides: draft.overrides,
			featureId: entry.feature_id,
			behavior: entry.billing_behavior,
		});
		if (!price)
			return { kind: "invalid", reason: `no price for ${entry.feature_id}` };
		const quantity = entry.quantity ?? 0;
		if (quantity <= 0) continue;
		const amount = oracleQuantityToAmount({ price, quantity });
		const prorate =
			entry.prorate ?? entry.billing_behavior === BillingMethod.Prepaid;
		lines.push({
			featureId: entry.feature_id,
			quantity,
			amount: prorate
				? oracleProrate({ amount, interval: price.interval, period })
				: amount,
			prorated: prorate && Boolean(period),
		});
	}

	// Lines preview the whole cents Stripe bills; the total adds those cents.
	const billable = lines
		.filter((line) => Math.abs(line.amount) > 1e-12)
		.map((line) => ({ ...line, amount: roundToCents(line.amount) }));
	if (billable.length === 0)
		return { kind: "invalid", reason: "nothing to invoice" };
	return {
		kind: "lines",
		lines: billable,
		total: roundToCents(billable.reduce((sum, line) => sum + line.amount, 0)),
	};
};

const describeShape = (shape: PriceShape) =>
	`${shape.behavior === BillingMethod.Prepaid ? "pre" : "use"}/${
		shape.amount !== undefined
			? `$${shape.amount}`
			: shape.volume
				? "vol"
				: "grad"
	}/bu${shape.billingUnits}${shape.interval === "year" ? "/yr" : ""}`;

const summarize = ({
	catalog,
	draft,
	period,
	mutation,
}: {
	catalog: FuzzCatalog;
	draft: Draft;
	period?: OraclePeriod;
	mutation?: InvalidMutation;
}) => {
	const { plan } = draft;
	const basePart = catalog.base ? `base$${catalog.base.amount}` : "nobase";
	const catalogPart = catalog.items
		.map((item) => `${item.featureId}:${describeShape(item.price)}`)
		.join(",");
	const customPrice = plan.customize?.price;
	const pricePart =
		customPrice === undefined
			? ""
			: ` price=${customPrice === null ? "null" : customPrice.amount}`;
	const overridePart = [...draft.overrides.entries()]
		.map(([featureId, shape]) => `${featureId}:${describeShape(shape)}`)
		.join(",");
	const quantityPart = (plan.feature_quantities ?? [])
		.map((entry) => `${entry.feature_id}=${entry.quantity ?? "usage"}`)
		.join(",");
	const periodDays = period
		? `${Math.round((period.end - period.start) / 86_400_000)}d`
		: "none";
	return `[${basePart} ${catalogPart}]${pricePart} cust=[${overridePart}] q=[${quantityPart}] period=${periodDays}${
		mutation ? ` invalid=${mutation}` : ""
	}`;
};

/** Builds one deterministic scenario: catalog plan, invoice request and oracle expectation. */
export const generateCustomizeScenario = ({
	seed,
	allowInvalid,
}: {
	seed: number;
	allowInvalid: boolean;
}): FuzzScenario => {
	const rng = createRng(seed);
	const catalog = genCatalog(rng);
	const draft: Draft = { plan: {}, overrides: new Map() };
	const { plan } = draft;

	const roll = rng.next();
	if (roll < 0.15) plan.customize = { price: null };
	else if (roll < 0.25)
		plan.customize = { price: { amount: 0, interval: BillingInterval.Month } };
	else if (roll < 0.55)
		plan.customize = {
			price: {
				amount: rng.pick([15, 33.33, 120, 999]),
				interval: rng.pick([BillingInterval.Month, BillingInterval.Year]),
			},
		};

	for (const item of catalog.items) {
		if (!rng.chance(0.45)) continue;
		const switchMethod = rng.chance(0.3);
		const behavior = switchMethod
			? opposite(item.price.behavior)
			: item.price.behavior;
		draft.overrides.set(
			item.featureId,
			genPriceShape({
				rng,
				behavior,
				interval: rng.chance(0.2) ? "year" : "month",
			}),
		);
	}
	const newFeature = freeFeatureOf({ catalog, draft });
	if (newFeature && rng.chance(0.4)) {
		draft.overrides.set(
			newFeature,
			genPriceShape({
				rng,
				behavior: rng.pick([BillingMethod.Prepaid, BillingMethod.UsageBased]),
				interval: rng.chance(0.2) ? "year" : "month",
			}),
		);
	}
	if (draft.overrides.size > 0) {
		plan.customize = {
			...plan.customize,
			items: [...draft.overrides.entries()].map(([featureId, shape]) => ({
				feature_id: featureId,
				price: shapeToRequestPrice(shape),
			})),
		};
	}

	const billedFeatures = [
		...new Set([
			...catalog.items.map((item) => item.featureId),
			...draft.overrides.keys(),
		]),
	];
	plan.feature_quantities = billedFeatures
		.filter(() => rng.chance(0.85))
		.map((featureId) => {
			const override = draft.overrides.get(featureId);
			const catalogItem = catalog.items.find(
				(item) => item.featureId === featureId,
			);
			const price = (override ?? catalogItem?.price) as PriceShape;
			const prorate = rng.pick([undefined, true, false]);
			return {
				feature_id: featureId,
				billing_behavior: price.behavior,
				quantity: genQuantity({ rng, price }),
				...(prorate === undefined ? {} : { prorate }),
			};
		});

	const planProrate = rng.pick([undefined, true, false]);
	if (planProrate !== undefined) plan.prorate = planProrate;
	const period = rng.pick([undefined, undefined, ...PERIODS]);

	const mutations: InvalidMutation[] = [
		"behavior_mismatch_new_feature",
		"unpriced_feature",
		"quantity_and_usage",
		"negative_quantity",
		"negative_base_amount",
		"negative_item_amount",
		"negative_tier_amount",
		"zero_billing_units",
		"amount_and_tiers",
		"flat_amount_on_graduated",
		"volume_usage_based",
		"unsorted_tiers",
		"missing_inf_tier",
		"duplicate_item",
	];
	const mutation =
		allowInvalid && rng.chance(0.3) ? rng.pick(mutations) : undefined;
	if (mutation && applyInvalidMutation({ rng, catalog, draft, mutation })) {
		draft.invalidReason = mutation;
	}

	return {
		seed,
		productId: `fuzz-${seed}`,
		catalog,
		plan,
		period,
		expected: computeExpectation({ catalog, draft, period }),
		summary: summarize({
			catalog,
			draft,
			period,
			mutation: draft.invalidReason ? mutation : undefined,
		}),
	};
};
