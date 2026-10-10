import { mock } from "bun:test";
import {
	AllowanceType,
	BillingInterval,
	BillWhen,
	EntInterval,
	type Entitlement,
	type EntitlementWithFeature,
	type Feature,
	type FeatureOptions,
	FeatureType,
	FeatureUsageType,
	type FullCusProduct,
	type FullCustomerEntitlement,
	type FullCustomerPrice,
	type FullPlanLicense,
	type FullProduct,
	Infinite,
	type Price,
	PriceType,
	type ProcessorType,
	type RolloverConfig,
	type TierBehavior,
	type UsageTier,
} from "@autumn/shared";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { features } from "@tests/utils/fixtures/db/features";
import { products } from "@tests/utils/fixtures/db/products";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deriveCustomerProductIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/deriveCustomerProductIsCustom";

export const credits = features.create({
	id: "credits",
	name: "Credits",
	config: { usage_type: FeatureUsageType.Single },
}) as Feature;

export const seats = features.create({
	id: "seats",
	name: "Seats",
	config: { usage_type: FeatureUsageType.Continuous },
}) as Feature;

export const workspaces = features.create({
	id: "workspaces",
	name: "Workspaces",
	config: { usage_type: FeatureUsageType.Continuous },
}) as Feature;

export const sso = features.create({
	id: "sso",
	name: "SSO",
	type: FeatureType.Boolean,
}) as Feature;

export const allFeatures = [credits, seats, workspaces, sso];

/** One plan item: an entitlement and, when billed, its price. */
export type PlanItemRows = {
	entitlement: EntitlementWithFeature;
	price?: Price;
};

const CATALOG_INTERNAL_PRODUCT_ID = "prod_internal_pro";

const entitlementRow = ({
	feature,
	allowance,
	allowanceType = AllowanceType.Fixed,
	interval = EntInterval.Month,
	rollover = null,
	pooled = false,
	entityFeatureId = null,
	usageLimit = null,
	id = `ent_${feature.id}`,
}: {
	feature: Feature;
	allowance: number | null;
	allowanceType?: AllowanceType;
	interval?: EntInterval | null;
	rollover?: RolloverConfig | null;
	pooled?: boolean;
	entityFeatureId?: string | null;
	usageLimit?: number | null;
	id?: string;
}): EntitlementWithFeature =>
	({
		id,
		created_at: 1,
		org_id: "org_test",
		internal_feature_id: feature.internal_id,
		feature_id: feature.id,
		internal_product_id: CATALOG_INTERNAL_PRODUCT_ID,
		is_custom: false,
		allowance,
		allowance_type: allowanceType,
		interval,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: entityFeatureId,
		pooled,
		usage_limit: usageLimit,
		rollover,
		feature,
	}) as EntitlementWithFeature;

const usagePriceRow = ({
	feature,
	entitlementId,
	billWhen,
	tiers,
	billingUnits = 1,
	interval = BillingInterval.Month,
	shouldProrate,
	currencies,
	stripePriceId,
	prorationConfig = null,
	tierBehavior = null,
	id = `pr_${feature.id}`,
}: {
	feature: Feature;
	entitlementId: string;
	billWhen: BillWhen;
	tiers: UsageTier[];
	billingUnits?: number;
	interval?: BillingInterval;
	shouldProrate?: boolean;
	currencies?: Record<string, { usage_tiers: UsageTier[] }>;
	stripePriceId?: string;
	prorationConfig?: Price["proration_config"];
	tierBehavior?: TierBehavior | null;
	id?: string;
}): Price =>
	({
		id,
		org_id: "org_test",
		created_at: 1,
		internal_product_id: CATALOG_INTERNAL_PRODUCT_ID,
		is_custom: false,
		entitlement_id: entitlementId,
		proration_config: prorationConfig,
		tier_behavior: tierBehavior,
		config: {
			type: PriceType.Usage,
			bill_when: billWhen,
			billing_units: billingUnits,
			internal_feature_id: feature.internal_id,
			feature_id: feature.id,
			usage_tiers: tiers,
			interval,
			interval_count: 1,
			base_currency: "usd",
			...(currencies ? { currencies } : {}),
			...(shouldProrate !== undefined ? { should_prorate: shouldProrate } : {}),
			stripe_price_id: stripePriceId ?? `stripe_${id}`,
		},
	}) as Price;

const flatTier = (amount: number): UsageTier[] => [{ to: Infinite, amount }];

/** Free metered grant that resets on an interval. */
export const includedItem = ({
	feature = credits,
	allowance = 200,
	...rest
}: Partial<Parameters<typeof entitlementRow>[0]> = {}): PlanItemRows => ({
	entitlement: entitlementRow({ feature, allowance, ...rest }),
});

export const unlimitedItem = ({
	feature = credits,
}: {
	feature?: Feature;
} = {}): PlanItemRows => ({
	entitlement: entitlementRow({
		feature,
		allowance: null,
		allowanceType: AllowanceType.Unlimited,
	}),
});

export const booleanItem = ({
	feature = sso,
}: {
	feature?: Feature;
} = {}): PlanItemRows => ({
	entitlement: entitlementRow({
		feature,
		allowance: null,
		allowanceType: AllowanceType.None,
		interval: null,
	}),
});

type PricedItemParams = {
	feature?: Feature;
	allowance?: number;
	amount?: number;
	tiers?: UsageTier[];
	billingUnits?: number;
	interval?: BillingInterval;
	resetInterval?: EntInterval | null;
	rollover?: RolloverConfig | null;
	pooled?: boolean;
	usageLimit?: number | null;
	currencies?: Record<string, { usage_tiers: UsageTier[] }>;
	stripePriceId?: string;
	prorationConfig?: Price["proration_config"];
	tierBehavior?: TierBehavior | null;
	entityFeatureId?: string | null;
	entitlementId?: string;
	priceId?: string;
};

const pricedItem = ({
	billWhen,
	shouldProrate,
	defaultFeature,
	params: {
		feature = defaultFeature,
		allowance = 0,
		amount = 10,
		tiers,
		billingUnits,
		interval,
		resetInterval = EntInterval.Month,
		rollover,
		pooled,
		usageLimit,
		currencies,
		stripePriceId,
		prorationConfig,
		tierBehavior,
		entityFeatureId,
		entitlementId = `ent_${feature.id}`,
		priceId,
	},
}: {
	billWhen: BillWhen;
	shouldProrate?: boolean;
	defaultFeature: Feature;
	params: PricedItemParams;
}): PlanItemRows => ({
	entitlement: entitlementRow({
		feature,
		allowance,
		interval: resetInterval,
		rollover,
		pooled,
		usageLimit,
		entityFeatureId,
		id: entitlementId,
	}),
	price: usagePriceRow({
		feature,
		entitlementId,
		billWhen,
		tiers: tiers ?? flatTier(amount),
		billingUnits,
		interval,
		shouldProrate,
		currencies,
		stripePriceId,
		prorationConfig,
		tierBehavior,
		id: priceId,
	}),
});

/** Prepaid consumable: credits bought up front each cycle. */
export const prepaidItem = (params: PricedItemParams = {}) =>
	pricedItem({
		billWhen: BillWhen.InAdvance,
		defaultFeature: credits,
		params,
	});

/** Prepaid non-consumable: seats bought up front, kept across cycles. */
export const prepaidSeatsItem = (params: PricedItemParams = {}) =>
	pricedItem({
		billWhen: BillWhen.InAdvance,
		defaultFeature: seats,
		params,
	});

/** Postpaid consumable: overage billed in arrears. */
export const payPerUseItem = (params: PricedItemParams = {}) =>
	pricedItem({
		billWhen: BillWhen.EndOfPeriod,
		defaultFeature: credits,
		params,
	});

/** Postpaid non-consumable: allocated seats, prorated as they change. */
export const allocatedSeatsItem = (params: PricedItemParams = {}) =>
	pricedItem({
		billWhen: BillWhen.EndOfPeriod,
		shouldProrate: true,
		defaultFeature: seats,
		params,
	});

export const basePrice = ({
	amount = 49,
	interval = BillingInterval.Month,
	currencies,
	stripePriceId = "stripe_price_base_v1",
	id = "pr_base",
}: {
	amount?: number;
	interval?: BillingInterval;
	currencies?: Record<string, { amount: number }>;
	stripePriceId?: string;
	id?: string;
} = {}): Price =>
	({
		id,
		org_id: "org_test",
		created_at: 1,
		internal_product_id: CATALOG_INTERNAL_PRODUCT_ID,
		is_custom: false,
		entitlement_id: null,
		proration_config: null,
		tier_behavior: null,
		config: {
			type: PriceType.Fixed,
			amount,
			interval,
			interval_count: 1,
			base_currency: "usd",
			...(currencies ? { currencies } : {}),
			stripe_price_id: stripePriceId,
		},
	}) as Price;

/** Same terms on a fresh row, as an import or a customize copy would mint. */
export const asCustomRow = <T extends PlanItemRows | Price>(rows: T): T => {
	const copyEntitlement = (entitlement: Entitlement) => ({
		...entitlement,
		id: `${entitlement.id}_custom`,
		is_custom: true,
		created_at: 2,
	});
	const copyPrice = (price: Price): Price => ({
		...price,
		id: `${price.id}_custom`,
		is_custom: true,
		created_at: 2,
		entitlement_id: price.entitlement_id
			? `${price.entitlement_id}_custom`
			: null,
		config: {
			...price.config,
			stripe_price_id: `${price.config.stripe_price_id}_legacy`,
		},
	});

	if ("config" in rows) return copyPrice(rows) as T;
	return {
		entitlement: copyEntitlement(rows.entitlement),
		...(rows.price ? { price: copyPrice(rows.price) } : {}),
	} as T;
};

export const planLicense = ({
	included = 2,
	licensePlanId = "seat_plan",
}: {
	included?: number;
	licensePlanId?: string;
} = {}) =>
	({
		id: `plan_lic_${licensePlanId}`,
		included,
		prepaid_only: true,
		is_custom: false,
		customized: false,
		parent_internal_product_id: CATALOG_INTERNAL_PRODUCT_ID,
		license_internal_product_id: `prod_internal_${licensePlanId}`,
		metadata: {},
		created_at: 1,
		updated_at: 1,
		product: {
			...products.create({ id: licensePlanId }),
			internal_id: `prod_internal_${licensePlanId}`,
			prices: [],
			entitlements: [],
			free_trial: null,
		},
	}) as unknown as FullPlanLicense;

type PlanShape = {
	items?: PlanItemRows[];
	prices?: Price[];
	licenses?: FullPlanLicense[];
	freeTrial?: unknown;
	name?: string;
};

const productShape = ({ name = "Pro" }: { name?: string }) => ({
	...products.create({ id: "pro" }),
	name,
	version: 3,
	internal_id: CATALOG_INTERNAL_PRODUCT_ID,
});

const planRows = ({ items = [], prices = [] }: PlanShape) => ({
	entitlements: items.map((item) => item.entitlement),
	prices: [
		...prices,
		...items.flatMap((item) => (item.price ? [item.price] : [])),
	],
});

export const catalogPlan = (shape: PlanShape = {}): FullProduct =>
	({
		...productShape(shape),
		...planRows(shape),
		free_trial: shape.freeTrial ?? null,
		licenses: shape.licenses ?? [],
	}) as unknown as FullProduct;

/** Runtime state (balances, quantities, rollovers) that must never affect the flag. */
type CustomerRuntimeState = {
	balance?: number;
	options?: FeatureOptions[];
	rolloverBalances?: number[];
	processorType?: ProcessorType;
};

export const customerPlan = (
	shape: PlanShape & CustomerRuntimeState = {},
): FullCusProduct => {
	const { entitlements, prices } = planRows(shape);
	const customerProduct = customerProducts.create({
		id: "cus_prod_1",
		productId: "pro",
		options: shape.options,
		processorType: shape.processorType,
		product: catalogPlan({ name: shape.name }),
		customerEntitlements: entitlements.map(
			(entitlement) =>
				({
					id: `cus_ent_${entitlement.id}`,
					customer_product_id: "cus_prod_1",
					entitlement_id: entitlement.id,
					internal_feature_id: entitlement.internal_feature_id,
					feature_id: entitlement.feature_id,
					balance: shape.balance ?? entitlement.allowance ?? 0,
					adjustment: 0,
					additional_balance: 0,
					unlimited: entitlement.allowance_type === AllowanceType.Unlimited,
					usage_allowed: true,
					entities: null,
					next_reset_at: null,
					rollovers: (shape.rolloverBalances ?? []).map((balance, index) => ({
						id: `roll_${index}`,
						cus_ent_id: `cus_ent_${entitlement.id}`,
						balance,
						usage: 0,
						expires_at: null,
						entities: {},
					})),
					replaceables: [],
					entitlement,
				}) as unknown as FullCustomerEntitlement,
		),
		customerPrices: prices.map(
			(price) =>
				({
					id: `cus_price_${price.id}`,
					customer_product_id: "cus_prod_1",
					internal_customer_id: "cus_internal",
					created_at: 1,
					price_id: price.id,
					price,
				}) as FullCustomerPrice,
		),
	});

	return {
		...customerProduct,
		internal_product_id: CATALOG_INTERNAL_PRODUCT_ID,
		free_trial: (shape.freeTrial ?? null) as FullCusProduct["free_trial"],
		customer_licenses: (shape.licenses ?? []).map((planLicenseRow) => ({
			planLicense: planLicenseRow,
		})),
	} as FullCusProduct;
};

export const fakeLogger = ({
	onError = () => {},
}: {
	onError?: (...args: unknown[]) => void;
} = {}) => {
	const logger = {
		warn: mock(() => {}),
		error: mock(onError),
		child: mock(() => logger),
	};
	return logger;
};

export const derive = ({
	customer,
	catalog,
	logger = fakeLogger(),
}: {
	customer: FullCusProduct;
	catalog?: FullProduct | null;
	logger?: ReturnType<typeof fakeLogger>;
}) =>
	deriveCustomerProductIsCustom({
		ctx: { logger } as unknown as Pick<AutumnContext, "logger">,
		customerProduct: customer,
		baseProduct: catalog,
		features: allFeatures,
	});
