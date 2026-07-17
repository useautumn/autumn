import { expect, test } from "bun:test";
import {
	AllowanceType,
	CusProductStatus,
	cusEntsToCurrentBalance,
	cusEntsToUsage,
	cusEntToInvoiceOverage,
	EntInterval,
	FeatureType,
	type FullSubject,
	type SubjectBalance,
} from "@autumn/shared";
import {
	getCustomerEntitlementGrantState,
	reapplyUsageToCustomerEntitlements,
} from "@/internal/balances/recalculateBalance/reapplyUsageToCustomerEntitlements.js";
import { computePooledBalanceCacheCutover } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceCacheCutover.js";
import {
	computePooledBalanceRebalance,
	computePooledBalanceUsageReapply,
} from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceRebalance.js";
import { computePooledBalanceReconciliation } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceReconciliation.js";

type BalanceInput = {
	id: string;
	interval: EntInterval;
	adjustment: number;
	balance: number;
	allowance?: number;
	pooled?: boolean;
};

const buildFullSubject = ({
	balances,
}: {
	balances: BalanceInput[];
}): FullSubject =>
	({
		subjectType: "customer",
		customerId: "pooled-rebalance-customer",
		internalCustomerId: "internal-pooled-rebalance-customer",
		customer: {},
		customer_products: [],
		extra_customer_entitlements: balances.map(
			(
				{ id, interval, adjustment, balance, allowance = 0, pooled = true },
				index,
			) => ({
				id,
				internal_customer_id: "internal-pooled-rebalance-customer",
				internal_entity_id: null,
				internal_feature_id: "internal-messages",
				customer_id: "pooled-rebalance-customer",
				feature_id: "messages",
				customer_product_id: null,
				entitlement_id: `entitlement-${id}`,
				created_at: index + 1,
				unlimited: false,
				balance,
				additional_balance: 0,
				usage_allowed: false,
				separate_interval: false,
				reset_cycle_anchor: 1_800_000_000_000,
				next_reset_at: 1_900_000_000_000,
				adjustment,
				expires_at: null,
				cache_version: 0,
				entities: null,
				external_id: null,
				entitlement: {
					id: `entitlement-${id}`,
					internal_feature_id: "internal-messages",
					internal_product_id: null,
					internal_reward_id: null,
					is_custom: true,
					allowance_type: AllowanceType.Fixed,
					allowance,
					interval,
					interval_count: 1,
					carry_from_previous: false,
					entity_feature_id: null,
					pooled,
					feature_id: "messages",
					usage_limit: null,
					expiry_duration: null,
					expiry_length: null,
					rollover: null,
					feature: {
						id: "messages",
						internal_id: "internal-messages",
						type: FeatureType.Metered,
					},
				},
				replaceables: [],
				rollovers: [],
			}),
		),
		invoices: [],
	}) as unknown as FullSubject;

const deltasById = ({
	fullSubject,
	reverseOrder = false,
}: {
	fullSubject: FullSubject;
	reverseOrder?: boolean;
}) =>
	Object.fromEntries(
		computePooledBalanceRebalance({
			fullSubject,
			featureIds: ["messages"],
			reverseOrder,
		}).map(({ customerEntitlementId, delta }) => [
			customerEntitlementId,
			delta,
		]),
	);

const addOutgoingCustomerProduct = ({
	fullSubject,
	balance,
	pooled = false,
	interval,
}: {
	fullSubject: FullSubject;
	balance: number;
	pooled?: boolean;
	interval?: EntInterval;
}) => {
	const sourceCustomerEntitlement = structuredClone(
		fullSubject.extra_customer_entitlements[0],
	);
	sourceCustomerEntitlement.id = "outgoing-entitlement";
	sourceCustomerEntitlement.customer_product_id = "outgoing-product";
	sourceCustomerEntitlement.entitlement_id = "outgoing-catalog-entitlement";
	sourceCustomerEntitlement.balance = balance;
	sourceCustomerEntitlement.adjustment = 0;
	sourceCustomerEntitlement.entitlement = {
		...sourceCustomerEntitlement.entitlement,
		id: "outgoing-catalog-entitlement",
		internal_product_id: "outgoing-catalog-product",
		allowance: 500,
		pooled,
		interval: interval ?? sourceCustomerEntitlement.entitlement.interval,
	};
	fullSubject.customer_products = [
		{
			id: "outgoing-product",
			status: CusProductStatus.Active,
			internal_entity_id: null,
			customer_entitlements: [sourceCustomerEntitlement],
		} as never,
	];
};

test("rebalances using the normal daily-before-monthly order", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "daily",
				interval: EntInterval.Day,
				adjustment: 100,
				balance: -200,
			},
			{
				id: "monthly",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 500,
			},
		],
	});

	expect(deltasById({ fullSubject })).toEqual({
		daily: 200,
		monthly: -200,
	});
});

test("honors reverse deduction order without adding a pooled-only sorter", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "daily",
				interval: EntInterval.Day,
				adjustment: 100,
				balance: -200,
			},
			{
				id: "monthly",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 500,
			},
		],
	});

	expect(deltasById({ fullSubject, reverseOrder: true })).toEqual({
		daily: 300,
		monthly: -300,
	});
});

test("preserves residual overage when surviving grants cannot cover usage", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "removed",
				interval: EntInterval.Day,
				adjustment: 0,
				balance: -600,
			},
			{
				id: "surviving",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 500,
			},
		],
	});
	const deltas = deltasById({ fullSubject });
	const finalAggregateBalance = fullSubject.extra_customer_entitlements.reduce(
		(total, customerEntitlement) =>
			total +
			(customerEntitlement.balance ?? 0) +
			(deltas[customerEntitlement.id] ?? 0),
		0,
	);

	expect(finalAggregateBalance).toBe(-100);
});

test("rebalances a customer-level pooled item as an ordinary balance", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "removed",
				interval: EntInterval.Day,
				adjustment: 0,
				balance: -500,
			},
		],
	});
	addOutgoingCustomerProduct({
		fullSubject,
		balance: 400,
		pooled: true,
		interval: EntInterval.Month,
	});

	expect(deltasById({ fullSubject })).toEqual({
		removed: 400,
		"outgoing-entitlement": -400,
	});
});

test("reapplies transition usage to the shared pool without charging the outgoing source twice", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "shared-pool",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 500,
			},
		],
	});
	addOutgoingCustomerProduct({ fullSubject, balance: 400 });

	expect(
		computePooledBalanceUsageReapply({
			fullSubject,
			usageReapplies: [
				{
					featureId: "messages",
					amount: 100,
					excludedSourceCustomerProductId: "outgoing-product",
				},
			],
		}),
	).toEqual([
		{
			customerEntitlementId: "shared-pool",
			featureId: "messages",
			delta: -100,
		},
	]);
});

test("reapplies transition debt as pooled overage", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "shared-pool",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 500,
			},
		],
	});
	addOutgoingCustomerProduct({ fullSubject, balance: -100 });

	expect(
		computePooledBalanceUsageReapply({
			fullSubject,
			usageReapplies: [
				{
					featureId: "messages",
					amount: 600,
					excludedSourceCustomerProductId: "outgoing-product",
				},
			],
		}),
	).toEqual([
		{
			customerEntitlementId: "shared-pool",
			featureId: "messages",
			delta: -600,
		},
	]);
});

test("reconciles a cache-flushed track with the latest contribution grants", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "removed",
				interval: EntInterval.Day,
				adjustment: 500,
				balance: 100,
			},
			{
				id: "surviving",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 500,
			},
		],
	});

	expect(
		computePooledBalanceReconciliation({
			fullSubject,
			featureIds: ["messages"],
			pooledGrantByCustomerEntitlementId: new Map([
				["removed", 0],
				["surviving", 500],
			]),
		}),
	).toEqual([
		{
			customerEntitlementId: "removed",
			featureId: "messages",
			balance: 0,
			adjustment: 0,
		},
		{
			customerEntitlementId: "surviving",
			featureId: "messages",
			balance: 100,
			adjustment: 500,
		},
	]);
});

test("reconciles a Redis-only deduction after the lifecycle DB state changed", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "removed",
				interval: EntInterval.Day,
				adjustment: 0,
				balance: 0,
			},
			{
				id: "surviving",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 500,
			},
		],
	});
	const liveBalances = [
		{
			...fullSubject.extra_customer_entitlements[0],
			balance: 100,
			adjustment: 500,
			isEntityLevel: false,
		},
		{
			...fullSubject.extra_customer_entitlements[1],
			balance: 500,
			adjustment: 500,
			isEntityLevel: false,
		},
	] as SubjectBalance[];

	expect(
		computePooledBalanceReconciliation({
			fullSubject,
			featureIds: ["messages"],
			pooledGrantByCustomerEntitlementId: new Map([
				["removed", 0],
				["surviving", 500],
			]),
			liveBalances,
		}),
	).toEqual([
		{
			customerEntitlementId: "removed",
			featureId: "messages",
			balance: 0,
			adjustment: 0,
		},
		{
			customerEntitlementId: "surviving",
			featureId: "messages",
			balance: 100,
			adjustment: 500,
		},
	]);
});

test("reapplies usage from the contribution-backed grant for one coalesced entitlement", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "coalesced",
				interval: EntInterval.Month,
				adjustment: 1000,
				balance: 400,
			},
		],
	});
	const customerEntitlement = {
		...structuredClone(fullSubject.extra_customer_entitlements[0]),
		customer_product: null,
	};
	const usage = cusEntsToUsage({ cusEnts: [customerEntitlement] });
	customerEntitlement.adjustment = 500;

	reapplyUsageToCustomerEntitlements({
		customerEntitlements: [customerEntitlement],
		usage,
		getGrantState: getCustomerEntitlementGrantState,
	});

	expect(usage).toBe(600);
	expect(customerEntitlement.adjustment).toBe(500);
	expect(customerEntitlement.balance).toBe(-100);
	expect(cusEntsToCurrentBalance({ cusEnts: [customerEntitlement] })).toBe(0);
	expect(cusEntToInvoiceOverage({ cusEnt: customerEntitlement })).toBe(100);
});

test("normal recalculation uses the catalog grant and clears adjustments", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "normal",
				interval: EntInterval.Month,
				allowance: 500,
				pooled: false,
				adjustment: 100,
				balance: 400,
			},
		],
	});
	const customerEntitlement = {
		...fullSubject.extra_customer_entitlements[0],
		customer_product: null,
	};

	expect(getCustomerEntitlementGrantState({ customerEntitlement })).toEqual({
		startingBalance: 500,
		adjustment: 0,
	});
});

test("a customer-product pooled item still uses normal recalculation", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "customer-product-pooled",
				interval: EntInterval.Month,
				allowance: 500,
				pooled: true,
				adjustment: 100,
				balance: 400,
			},
		],
	});
	const customerEntitlement = {
		...fullSubject.extra_customer_entitlements[0],
		customer_product: {} as never,
	};

	expect(getCustomerEntitlementGrantState({ customerEntitlement })).toEqual({
		startingBalance: 500,
		adjustment: 0,
	});
});

test("recalculates new entity rows through their top-level balances", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "entity-daily",
				interval: EntInterval.Day,
				allowance: 100,
				pooled: false,
				adjustment: 0,
				balance: -30,
			},
			{
				id: "entity-monthly",
				interval: EntInterval.Month,
				allowance: 200,
				pooled: false,
				adjustment: 0,
				balance: 200,
			},
		],
	});
	const customerEntitlements = fullSubject.extra_customer_entitlements.map(
		(customerEntitlement) => ({
			...customerEntitlement,
			internal_entity_id: null,
			entities: null,
			entitlement: {
				...customerEntitlement.entitlement,
				entity_feature_id: "seats",
			},
			customer_product: {
				id: `product-${customerEntitlement.id}`,
				internal_entity_id: "internal-entity-one",
			} as never,
		}),
	);
	const usage = 130;

	reapplyUsageToCustomerEntitlements({
		customerEntitlements,
		usage,
		targetEntityId: "entity-one",
		getGrantState: getCustomerEntitlementGrantState,
	});

	expect(usage).toBe(130);
	expect(
		customerEntitlements.map((customerEntitlement) => ({
			balance: customerEntitlement.balance,
			entities: customerEntitlement.entities,
		})),
	).toEqual([
		{ balance: 0, entities: null },
		{ balance: 170, entities: null },
	]);
});

test("preserves usage and debt when two sources coalesce into one entitlement", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "coalesced",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: -100,
			},
		],
	});
	const persistedCustomerEntitlement =
		fullSubject.extra_customer_entitlements[0];
	const liveBalance = {
		...persistedCustomerEntitlement,
		balance: 400,
		adjustment: 1000,
		isEntityLevel: false,
		customerPrice: null,
		customerProductOptions: null,
		customerProductQuantity: 1,
	} as SubjectBalance;

	const [effect] = computePooledBalanceCacheCutover({
		fullSubject,
		featureIds: ["messages"],
		rawEffects: [
			{
				featureId: "messages",
				customerEntitlementId: "coalesced",
				balanceDelta: -500,
				adjustmentDelta: -500,
			},
		],
		liveBalances: [liveBalance],
	});
	const customerEntitlementAfterRemoval = {
		...persistedCustomerEntitlement,
		balance: liveBalance.balance + effect.balanceDelta,
		adjustment: (liveBalance.adjustment ?? 0) + effect.adjustmentDelta,
		customer_product: null,
	};

	expect(customerEntitlementAfterRemoval.adjustment).toBe(500);
	expect(customerEntitlementAfterRemoval.balance).toBe(-100);
	expect(cusEntsToUsage({ cusEnts: [customerEntitlementAfterRemoval] })).toBe(
		600,
	);
	expect(
		cusEntsToCurrentBalance({ cusEnts: [customerEntitlementAfterRemoval] }),
	).toBe(0);
	expect(
		cusEntToInvoiceOverage({ cusEnt: customerEntitlementAfterRemoval }),
	).toBe(100);
});

test("does not rewrite an already valid nonnegative distribution", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "daily",
				interval: EntInterval.Day,
				adjustment: 100,
				balance: 0,
			},
			{
				id: "monthly",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 200,
			},
		],
	});

	expect(deltasById({ fullSubject })).toEqual({});
});

test("does not mint the catalog grant back onto normalized pooled source rows", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "synthetic-pool",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: -100,
			},
			{
				id: "surviving-pool",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 500,
			},
		],
	});
	const source = structuredClone(fullSubject.extra_customer_entitlements[0]);
	source.id = "normalized-source";
	source.customer_product_id = "customer-product-source";
	source.entitlement.allowance = 500;
	source.entitlement.interval = EntInterval.Year;
	source.balance = 0;
	source.adjustment = 0;
	fullSubject.customer_products = [
		{
			id: "customer-product-source",
			status: "active",
			internal_entity_id: "internal-entity-source",
			customer_entitlements: [source],
		} as never,
	];

	expect(deltasById({ fullSubject })).toEqual({
		"synthetic-pool": 100,
		"surviving-pool": -100,
	});
});

test("recomputes the cutover when a track lands immediately before source removal", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "removed",
				interval: EntInterval.Day,
				adjustment: 0,
				balance: 0,
			},
			{
				id: "surviving",
				interval: EntInterval.Month,
				adjustment: 500,
				balance: 200,
			},
		],
	});
	const liveBalances = [
		{
			...fullSubject.extra_customer_entitlements[0],
			balance: 100,
			adjustment: 500,
			isEntityLevel: false,
			customerPrice: null,
			customerProductOptions: null,
			customerProductQuantity: 1,
		},
		{
			...fullSubject.extra_customer_entitlements[1],
			balance: 500,
			adjustment: 500,
			isEntityLevel: false,
			customerPrice: null,
			customerProductOptions: null,
			customerProductQuantity: 1,
		},
	] as SubjectBalance[];

	const effects = computePooledBalanceCacheCutover({
		fullSubject,
		featureIds: ["messages"],
		rawEffects: [
			{
				featureId: "messages",
				customerEntitlementId: "removed",
				balanceDelta: -500,
				adjustmentDelta: -500,
			},
		],
		liveBalances,
	});

	expect(
		Object.fromEntries(
			effects.map((effect) => [effect.customerEntitlementId, effect]),
		),
	).toEqual({
		removed: {
			featureId: "messages",
			customerEntitlementId: "removed",
			balanceDelta: -100,
			adjustmentDelta: -500,
			expectedBalance: 100,
			expectedAdjustment: 500,
		},
		surviving: {
			featureId: "messages",
			customerEntitlementId: "surviving",
			balanceDelta: -400,
			adjustmentDelta: 0,
			expectedBalance: 500,
			expectedAdjustment: 500,
		},
	});
});

test("recomputes priority allocation from a concurrent live adjustment", () => {
	const fullSubject = buildFullSubject({
		balances: [
			{
				id: "daily",
				interval: EntInterval.Day,
				adjustment: 110,
				balance: -10,
			},
			{
				id: "monthly",
				interval: EntInterval.Month,
				adjustment: 100,
				balance: 100,
			},
		],
	});
	const liveBalances = [
		{
			...fullSubject.extra_customer_entitlements[0],
			balance: -20,
			adjustment: 100,
			isEntityLevel: false,
			customerPrice: null,
			customerProductOptions: null,
			customerProductQuantity: 1,
		},
		{
			...fullSubject.extra_customer_entitlements[1],
			balance: 200,
			adjustment: 200,
			isEntityLevel: false,
			customerPrice: null,
			customerProductOptions: null,
			customerProductQuantity: 1,
		},
	] as SubjectBalance[];

	const effects = computePooledBalanceCacheCutover({
		fullSubject,
		featureIds: ["messages"],
		rawEffects: [
			{
				featureId: "messages",
				customerEntitlementId: "daily",
				balanceDelta: 10,
				adjustmentDelta: 10,
			},
		],
		liveBalances,
	});

	expect(
		Object.fromEntries(
			effects.map((effect) => [effect.customerEntitlementId, effect]),
		),
	).toEqual({
		daily: {
			featureId: "messages",
			customerEntitlementId: "daily",
			balanceDelta: 20,
			adjustmentDelta: 10,
			expectedBalance: -20,
			expectedAdjustment: 100,
		},
		monthly: {
			featureId: "messages",
			customerEntitlementId: "monthly",
			balanceDelta: -10,
			adjustmentDelta: 0,
			expectedBalance: 200,
			expectedAdjustment: 200,
		},
	});
});
