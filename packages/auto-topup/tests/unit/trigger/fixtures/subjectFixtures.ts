import {
	type AutoTopup,
	BillingInterval,
	BillWhen,
	CusProductStatus,
	FeatureType,
	type FullCustomer,
	PriceType,
	type TierBehavior,
} from "@autumn/shared";
import type { AutoTopupSubject } from "../../../../src/trigger/types/autoTopupSubject.js";

export const FEATURE = "messages";
export const CREDITS = "credits";
/** The legacy function reads the clock for expiry, so the test instant is the real one. */
export const NOW = Date.now();
export const PAST = 1;
export const FUTURE = NOW + 1_000_000_000;

export const autoTopupFor = ({
	featureId = FEATURE,
	enabled = true,
	threshold = 20,
	quantity = 100,
}: {
	featureId?: string;
	enabled?: boolean;
	threshold?: number;
	quantity?: number;
} = {}): AutoTopup => ({
	feature_id: featureId,
	enabled,
	threshold,
	quantity,
});

export const usagePrice = ({
	id,
	entitlementId,
	customerProductId,
	billWhen = BillWhen.InAdvance,
	interval = BillingInterval.OneOff,
	amount = 10,
	threshold,
	tierBehavior,
}: {
	id: string;
	entitlementId: string;
	customerProductId: string;
	billWhen?: BillWhen;
	interval?: BillingInterval;
	amount?: number;
	threshold?: number;
	tierBehavior?: TierBehavior;
}) => ({
	id,
	customer_product_id: customerProductId,
	price: {
		id,
		entitlement_id: entitlementId,
		tier_behavior: tierBehavior,
		config: {
			type: PriceType.Usage,
			interval,
			bill_when: billWhen,
			usage_tiers: [{ from: 0, to: -1, amount }],
			billing_units: 1,
			...(threshold !== undefined && { threshold_billing: { threshold } }),
		},
	},
});

/** The monthly base price that marks a product as a subscription plan. */
export const fixedPrice = ({
	id,
	customerProductId,
	interval = BillingInterval.Month,
}: {
	id: string;
	customerProductId: string;
	interval?: BillingInterval;
}) => ({
	id,
	customer_product_id: customerProductId,
	price: {
		id,
		entitlement_id: null,
		config: { type: PriceType.Fixed, interval, amount: 20 },
	},
});

export const creditSystemFeature = ({
	id = CREDITS,
	funds = FEATURE,
}: {
	id?: string;
	funds?: string;
} = {}) => ({
	id,
	type: FeatureType.CreditSystem,
	config: { schema: [{ metered_feature_id: funds, credit_cost: 1 }] },
});

export const row = ({
	id,
	featureId = FEATURE,
	feature = { id: featureId, type: FeatureType.Metered, config: {} },
	balance = 0,
	customerProductId = null,
	expiresAt = null,
	internalEntityId = null,
	entities,
	rollovers = [],
	rollover = false,
	entityFeatureId = null,
	pooled = false,
}: {
	id: string;
	featureId?: string;
	feature?: Record<string, unknown>;
	balance?: number;
	customerProductId?: string | null;
	expiresAt?: number | null;
	internalEntityId?: string | null;
	entities?: Record<
		string,
		{ id: string; balance: number; adjustment: number }
	>;
	rollovers?: {
		id: string;
		balance: number;
		usage: number;
		expires_at: number | null;
	}[];
	/** The entitlement carries a rollover config, which is what makes `rollovers` count. */
	rollover?: boolean;
	/** Set on an entity-scoped entitlement, whose balance lives in `entities`. */
	entityFeatureId?: string | null;
	pooled?: boolean;
}) => ({
	id,
	customer_product_id: customerProductId,
	internal_feature_id: `feat_${featureId}`,
	internal_entity_id: internalEntityId,
	balance,
	additional_balance: 0,
	adjustment: 0,
	unlimited: false,
	usage_allowed: true,
	next_reset_at: null,
	expires_at: expiresAt,
	created_at: NOW,
	external_id: null,
	entities: entities ?? null,
	rollovers,
	entitlement: {
		id: `ent_${id}`,
		feature_id: featureId,
		feature,
		allowance: 0,
		entity_feature_id: entityFeatureId,
		rollover: rollover ? { max: null, length: 1, duration: "month" } : null,
		pooled,
	},
});

export const plan = ({
	id,
	createdAt = NOW,
	status = CusProductStatus.Active,
	internalEntityId = null,
	licenseLinkId = null,
	isAddOn = false,
	autoTopups = null,
	prices = [],
	rows = [],
}: {
	id: string;
	createdAt?: number;
	status?: CusProductStatus;
	internalEntityId?: string | null;
	licenseLinkId?: string | null;
	isAddOn?: boolean;
	autoTopups?: AutoTopup[] | null;
	prices?: unknown[];
	rows?: unknown[];
}) => ({
	id,
	internal_product_id: `prod_${id}`,
	status,
	created_at: createdAt,
	starts_at: createdAt,
	access_starts_at: null,
	ended_at: null,
	internal_entity_id: internalEntityId,
	entity_id: internalEntityId,
	customer_license_link_id: licenseLinkId,
	options: [],
	quantity: 1,
	product: { id, is_add_on: isAddOn, auto_topups: autoTopups },
	customer_prices: prices,
	customer_entitlements: rows,
});

/** A plan attached at `createdAt` whose one-off prepaid row for the feature holds `balance`. */
export const oneOffPrepaidPlan = ({
	id,
	createdAt = NOW,
	amount = 10,
	balance = 0,
	recurring = false,
	isAddOn = false,
	autoTopups = null,
	tierBehavior,
	rollovers,
}: {
	id: string;
	createdAt?: number;
	amount?: number;
	balance?: number;
	recurring?: boolean;
	isAddOn?: boolean;
	autoTopups?: AutoTopup[] | null;
	tierBehavior?: TierBehavior;
	rollovers?: {
		id: string;
		balance: number;
		usage: number;
		expires_at: number | null;
	}[];
}) =>
	plan({
		id,
		createdAt,
		isAddOn,
		autoTopups,
		prices: [
			usagePrice({
				id: `price_${id}`,
				entitlementId: `ent_row_${id}`,
				customerProductId: id,
				amount,
				tierBehavior,
			}),
			...(recurring
				? [fixedPrice({ id: `price_${id}_base`, customerProductId: id })]
				: []),
		],
		rows: [
			row({
				id: `row_${id}`,
				balance,
				customerProductId: id,
				rollovers,
				rollover: rollovers !== undefined,
			}),
		],
	});

export const subject = ({
	autoTopups = null,
	config = {},
	plans = [],
	extras = [],
	pooled = [],
	entity = null,
}: {
	autoTopups?: AutoTopup[] | null;
	config?: Record<string, unknown>;
	plans?: unknown[];
	extras?: unknown[];
	pooled?: unknown[];
	entity?: { id: string; internal_id: string; feature_id: string } | null;
}): AutoTopupSubject =>
	({
		customer: { config, auto_topups: autoTopups },
		entity,
		customer_products: plans,
		extra_customer_entitlements: extras,
		pooled_customer_entitlements: pooled,
	}) as unknown as AutoTopupSubject;

/** The FullCustomer the server built from the same subject before calling the legacy function. */
export const legacyCustomerOf = (fullSubject: AutoTopupSubject): FullCustomer =>
	({
		...fullSubject.customer,
		entity: fullSubject.entity,
		customer_products: fullSubject.customer_products,
		extra_customer_entitlements: fullSubject.extra_customer_entitlements,
		pooled_customer_entitlements:
			fullSubject.pooled_customer_entitlements ?? [],
	}) as unknown as FullCustomer;
