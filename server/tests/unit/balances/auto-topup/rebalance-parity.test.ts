import { describe, expect, test } from "bun:test";
import { rebalance, type WorkerFullSubject } from "@autumn/balance-engine";
import {
	AllowanceType,
	BillingInterval,
	BillWhen,
	CusProductStatus,
	type EntityBalance,
	FeatureType,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToFullSubject,
	PriceType,
} from "@autumn/shared";
import { computeRebalancedAutoTopUp } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp";

/**
 * Parity: the server's paydown (the Postgres lane) and the engine's rebalance (the worker lane)
 * must give the same deltas for the same customer. Each case also pins the expected deltas.
 */

const createCustomerEntitlement = ({
	id,
	balance,
	quantity = 0,
	usageAllowed = false,
	entities,
	createdAt = 1,
	allowance = 0,
	entityFeatureId = null,
	invoiceCredit = false,
}: {
	id: string;
	balance: number;
	quantity?: number;
	usageAllowed?: boolean;
	entities?: Record<string, EntityBalance>;
	createdAt?: number;
	allowance?: number;
	entityFeatureId?: string | null;
	invoiceCredit?: boolean;
}): FullCusEntWithFullCusProduct => {
	const entitlementId = `ent-${id}`;
	const customerProductId = `cus-prod-${id}`;

	return {
		id: `cus-ent-${id}`,
		internal_customer_id: "internal-customer",
		internal_entity_id: null,
		internal_feature_id: "internal-feature-messages",
		customer_id: "customer-1",
		feature_id: "messages",
		entitlement_id: entitlementId,
		customer_product_id: customerProductId,
		created_at: createdAt,
		unlimited: false,
		balance,
		additional_balance: 0,
		adjustment: 0,
		entities: entities ?? null,
		usage_allowed: usageAllowed,
		next_reset_at: null,
		expires_at: null,
		cache_version: 0,
		external_id: null,
		replaceables: [],
		rollovers: [],
		entitlement: {
			id: entitlementId,
			internal_feature_id: "internal-feature-messages",
			internal_product_id: "internal-product-1",
			is_custom: false,
			allowance_type: "fixed",
			allowance,
			interval: BillingInterval.Month,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: entityFeatureId,
			org_id: "org-1",
			feature_id: "messages",
			usage_limit: null,
			rollover: null,
			feature: {
				id: "messages",
				internal_id: "internal-feature-messages",
				name: "Messages",
				type: invoiceCredit ? FeatureType.CreditSystem : FeatureType.Metered,
				config: invoiceCredit ? { invoice_credit: true } : {},
				org_id: "org-1",
				env: "sandbox",
				created_at: 1,
				deleted_at: null,
			},
		},
		customer_product: {
			id: customerProductId,
			internal_id: customerProductId,
			internal_customer_id: "internal-customer",
			internal_product_id: "internal-product-1",
			internal_entity_id: null,
			customer_id: "customer-1",
			product_id: `product-${id}`,
			name: `Product ${id}`,
			group: "",
			created_at: 1,
			ended_at: null,
			canceled_at: null,
			cancel_at: null,
			expires_at: null,
			trial_ends_at: null,
			trial_started_at: null,
			anchor_at: null,
			quantity: 1,
			status: "active",
			canceled: false,
			version: 1,
			entity_id: null,
			replaces_customer_product_id: null,
			options: [
				{
					feature_id: "messages",
					internal_feature_id: "internal-feature-messages",
					quantity,
				},
			],
			product: {
				internal_id: "internal-product-1",
				id: `product-${id}`,
				name: `Product ${id}`,
				description: null,
				org_id: "org-1",
				created_at: 1,
				env: "sandbox",
				is_add_on: false,
				is_default: false,
				group: "",
				version: 1,
				processor: {},
				base_variant_id: null,
				base_internal_product_id: null,
				archived: false,
				free_trials: [],
				free_trial: null,
				prices: [],
				entitlements: [],
			},
			customer_entitlements: [],
			customer_prices: [
				{
					id: `cus-price-${id}`,
					price_id: `price-${id}`,
					customer_product_id: customerProductId,
					created_at: 1,
					price: {
						id: `price-${id}`,
						org_id: "org-1",
						internal_product_id: "internal-product-1",
						config: {
							type: PriceType.Usage,
							bill_when: BillWhen.InAdvance,
							billing_units: 100,
							internal_feature_id: "internal-feature-messages",
							feature_id: "messages",
							usage_tiers: [{ to: "inf", amount: 10 }],
							interval: BillingInterval.Month,
							interval_count: 1,
							stripe_meter_id: null,
							stripe_price_id: null,
							stripe_empty_price_id: null,
							stripe_product_id: null,
							stripe_placeholder_price_id: null,
							stripe_event_name: null,
							stripe_prepaid_price_v2_id: null,
							should_prorate: false,
						},
						created_at: 1,
						billing_type: null,
						tier_behavior: null,
						is_custom: false,
						entitlement_id: entitlementId,
						proration_config: {},
					},
				},
			],
		},
	} as unknown as FullCusEntWithFullCusProduct;
};

type CustomerEntitlement = FullCusEntWithFullCusProduct;

const ENTITY = {
	id: "entity-1",
	internal_id: "internal-entity-1",
	feature_id: "seats",
};

const onEntity = (customerEntitlement: CustomerEntitlement) =>
	({
		...customerEntitlement,
		customer_product: {
			...customerEntitlement.customer_product,
			internal_entity_id: ENTITY.internal_id,
			entity_id: ENTITY.id,
		},
	}) as CustomerEntitlement;

const asLoose = (customerEntitlement: CustomerEntitlement) =>
	({
		...customerEntitlement,
		customer_product_id: null,
		customer_product: null,
	}) as CustomerEntitlement;

const withFields = (
	customerEntitlement: CustomerEntitlement,
	fields: Record<string, unknown>,
) => ({ ...customerEntitlement, ...fields }) as CustomerEntitlement;

const withEntitlement = (
	customerEntitlement: CustomerEntitlement,
	fields: Record<string, unknown>,
) =>
	({
		...customerEntitlement,
		entitlement: { ...customerEntitlement.entitlement, ...fields },
	}) as CustomerEntitlement;

const withFeature = (
	customerEntitlement: CustomerEntitlement,
	fields: Record<string, unknown>,
) =>
	withEntitlement(customerEntitlement, {
		...(fields.id ? { feature_id: fields.id } : {}),
		feature: { ...customerEntitlement.entitlement.feature, ...fields },
	});

const withProduct = (
	customerEntitlement: CustomerEntitlement,
	fields: Record<string, unknown>,
) =>
	({
		...customerEntitlement,
		customer_product: { ...customerEntitlement.customer_product, ...fields },
	}) as CustomerEntitlement;

const buildFullCustomer = (
	customerEntitlements: CustomerEntitlement[],
): FullCustomer => {
	const productsById = new Map<string, CustomerEntitlement[]>();
	const loose: CustomerEntitlement[] = [];
	for (const customerEntitlement of customerEntitlements) {
		const customerProduct = customerEntitlement.customer_product;
		if (!customerProduct) {
			loose.push(customerEntitlement);
			continue;
		}
		productsById.set(customerProduct.id, [
			...(productsById.get(customerProduct.id) ?? []),
			customerEntitlement,
		]);
	}
	return {
		id: "customer-1",
		internal_id: "internal-customer",
		org_id: "org-1",
		env: "sandbox",
		customer_products: [...productsById.values()].map((rows) => ({
			...rows[0]?.customer_product,
			customer_entitlements: rows.map(({ customer_product, ...row }) => row),
		})),
		extra_customer_entitlements: loose.map(
			({ customer_product, ...row }) => row,
		),
		auto_topups: [],
		invoices: [],
		entities: [ENTITY],
	} as unknown as FullCustomer;
};

/** The purchased row's own subject, as the worker reads it: the customer's view, or its entity's. */
const toWorkerSubject = ({
	fullCustomer,
	purchasedOnEntity,
}: {
	fullCustomer: FullCustomer;
	purchasedOnEntity: boolean;
}) =>
	({
		...fullCustomerToFullSubject({ fullCustomer }),
		identity: {
			orgId: "org-1",
			env: "sandbox",
			customerId: "customer-1",
			entityId: purchasedOnEntity ? ENTITY.id : null,
		},
		revision: 0,
		entity: purchasedOnEntity ? ENTITY : null,
		usage_windows: [],
		open_locks: [],
	}) as unknown as WorkerFullSubject;

type ParityCase = {
	name: string;
	customerEntitlements: CustomerEntitlement[];
	purchasedId: string;
	quantity: number;
	purchasedOnEntity?: boolean;
	expected: { customerEntitlementId: string; delta: number }[];
};

const runBothLanes = ({
	customerEntitlements,
	purchasedId,
	quantity,
	purchasedOnEntity = false,
}: ParityCase) => {
	const fullCustomer = buildFullCustomer(customerEntitlements);
	const now = Date.now();
	const server = computeRebalancedAutoTopUp({
		fullCustomer,
		featureId: "messages",
		quantity,
		prepaidCustomerEntitlementId: purchasedId,
	}).deltas.map(({ cusEntId, delta }) => ({
		customerEntitlementId: cusEntId,
		delta,
	}));
	const engine = rebalance({
		fullSubject: toWorkerSubject({ fullCustomer, purchasedOnEntity }),
		request: {
			featureId: "messages",
			customerEntitlementId: purchasedId,
			quantity,
			creditedCustomerEntitlementId: purchasedId,
			now,
		},
	}).deltas;
	return { server, engine };
};

const ce = (id: string) => `cus-ent-${id}`;
const prepaid = () => createCustomerEntitlement({ id: "prepaid", balance: 0 });
const overage = ({
	id,
	balance,
	usageAllowed = true,
	createdAt = 1,
}: {
	id: string;
	balance: number;
	usageAllowed?: boolean;
	createdAt?: number;
}) => createCustomerEntitlement({ id, balance, usageAllowed, createdAt });

const cases: ParityCase[] = [
	{
		name: "C1 no overage: all to the purchased row",
		customerEntitlements: [overage({ id: "base", balance: 200 }), prepaid()],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [{ customerEntitlementId: ce("prepaid"), delta: 600 }],
	},
	{
		name: "C2 one row in overage: paid to 0, remainder credited",
		customerEntitlements: [overage({ id: "base", balance: -500 }), prepaid()],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [
			{ customerEntitlementId: ce("base"), delta: 500 },
			{ customerEntitlementId: ce("prepaid"), delta: 100 },
		],
	},
	{
		name: "C3 overage exceeds the quantity: paydown only",
		customerEntitlements: [overage({ id: "base", balance: -1000 }), prepaid()],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [{ customerEntitlementId: ce("base"), delta: 600 }],
	},
	{
		name: "C4 purchased row missing: nothing",
		customerEntitlements: [overage({ id: "base", balance: -500 })],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [],
	},
	{
		name: "C5 quantity 0: nothing",
		customerEntitlements: [overage({ id: "base", balance: -500 }), prepaid()],
		purchasedId: ce("prepaid"),
		quantity: 0,
		expected: [],
	},
	{
		name: "C6 per-entity balances are never paid down",
		customerEntitlements: [
			createCustomerEntitlement({
				id: "per-entity",
				balance: -100,
				usageAllowed: true,
				entityFeatureId: "seats",
				entities: { e1: { id: "e1", balance: -100, adjustment: 0 } },
			}),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [{ customerEntitlementId: ce("prepaid"), delta: 600 }],
	},
	{
		name: "C7 usage_allowed rows first",
		customerEntitlements: [
			overage({ id: "not-allowed", balance: -100, usageAllowed: false }),
			overage({
				id: "allowed",
				balance: -100,
				usageAllowed: true,
				createdAt: 9,
			}),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 150,
		expected: [
			{ customerEntitlementId: ce("allowed"), delta: 100 },
			{ customerEntitlementId: ce("not-allowed"), delta: 50 },
		],
	},
	{
		name: "C8 oldest first among equals",
		customerEntitlements: [
			overage({ id: "newer", balance: -100, createdAt: 20 }),
			overage({ id: "older", balance: -100, createdAt: 10 }),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 150,
		expected: [
			{ customerEntitlementId: ce("older"), delta: 100 },
			{ customerEntitlementId: ce("newer"), delta: 50 },
		],
	},
	{
		name: "C9 several rows paid down, then the remainder",
		customerEntitlements: [
			overage({ id: "a", balance: -300, createdAt: 1 }),
			overage({ id: "b", balance: -200, createdAt: 2 }),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 1000,
		expected: [
			{ customerEntitlementId: ce("a"), delta: 300 },
			{ customerEntitlementId: ce("b"), delta: 200 },
			{ customerEntitlementId: ce("prepaid"), delta: 500 },
		],
	},
	{
		name: "C10 an overdrawn purchased row is credited, not paid down",
		customerEntitlements: [
			overage({ id: "base", balance: -100 }),
			createCustomerEntitlement({ id: "prepaid", balance: -50 }),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [
			{ customerEntitlementId: ce("base"), delta: 100 },
			{ customerEntitlementId: ce("prepaid"), delta: 500 },
		],
	},
	{
		name: "C11 a null created_at counts as oldest",
		customerEntitlements: [
			overage({ id: "dated", balance: -100, createdAt: 5 }),
			withFields(overage({ id: "undated", balance: -100 }), {
				created_at: null,
			}),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 150,
		expected: [
			{ customerEntitlementId: ce("undated"), delta: 100 },
			{ customerEntitlementId: ce("dated"), delta: 50 },
		],
	},
	{
		name: "C12a a customer-level purchase leaves entity plans' overage alone",
		customerEntitlements: [
			overage({ id: "customer", balance: -100 }),
			onEntity(overage({ id: "entity", balance: -200 })),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [
			{ customerEntitlementId: ce("customer"), delta: 100 },
			{ customerEntitlementId: ce("prepaid"), delta: 500 },
		],
	},
	{
		name: "C12b an entity-level purchase pays only its entity's overage",
		customerEntitlements: [
			overage({ id: "customer", balance: -100 }),
			onEntity(overage({ id: "entity", balance: -200 })),
			onEntity(prepaid()),
		],
		purchasedId: ce("prepaid"),
		purchasedOnEntity: true,
		quantity: 600,
		expected: [
			{ customerEntitlementId: ce("entity"), delta: 200 },
			{ customerEntitlementId: ce("prepaid"), delta: 400 },
		],
	},
	{
		name: "C13 a loose grant in overage is paid down; an expired one is not",
		customerEntitlements: [
			asLoose(overage({ id: "loose", balance: -100 })),
			withFields(asLoose(overage({ id: "expired", balance: -100 })), {
				expires_at: 1,
			}),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [
			{ customerEntitlementId: ce("loose"), delta: 100 },
			{ customerEntitlementId: ce("prepaid"), delta: 500 },
		],
	},
	{
		name: "C15 a license seat's row is never paid down",
		customerEntitlements: [
			withProduct(onEntity(overage({ id: "seat", balance: -100 })), {
				customer_license_link_id: "link-1",
			}),
			onEntity(overage({ id: "entity", balance: -50 })),
			onEntity(prepaid()),
		],
		purchasedId: ce("prepaid"),
		purchasedOnEntity: true,
		quantity: 600,
		expected: [
			{ customerEntitlementId: ce("entity"), delta: 50 },
			{ customerEntitlementId: ce("prepaid"), delta: 550 },
		],
	},
	{
		name: "C16 unlimited by allowance is skipped; the unlimited column alone is not",
		customerEntitlements: [
			withEntitlement(overage({ id: "unlimited-allowance", balance: -100 }), {
				allowance_type: AllowanceType.Unlimited,
			}),
			withFields(overage({ id: "unlimited-column", balance: -100 }), {
				unlimited: true,
			}),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [
			{ customerEntitlementId: ce("unlimited-column"), delta: 100 },
			{ customerEntitlementId: ce("prepaid"), delta: 500 },
		],
	},
	{
		name: "C17 a boolean row is never paid down",
		customerEntitlements: [
			withFeature(overage({ id: "boolean", balance: -100 }), {
				type: FeatureType.Boolean,
			}),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [{ customerEntitlementId: ce("prepaid"), delta: 600 }],
	},
	{
		name: "C18 an expired purchased row: nothing",
		customerEntitlements: [
			overage({ id: "base", balance: -100 }),
			withFields(prepaid(), { expires_at: 1 }),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [],
	},
	{
		name: "C19 a purchased row on an expired product: nothing",
		customerEntitlements: [
			overage({ id: "base", balance: -100 }),
			withProduct(prepaid(), { status: CusProductStatus.Expired }),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [],
	},
	{
		name: "C20 decimals stay exact",
		customerEntitlements: [overage({ id: "base", balance: -0.3 }), prepaid()],
		purchasedId: ce("prepaid"),
		quantity: 0.7,
		expected: [
			{ customerEntitlementId: ce("base"), delta: 0.3 },
			{ customerEntitlementId: ce("prepaid"), delta: 0.4 },
		],
	},
	{
		name: "C22 another feature's rows are never paid down",
		customerEntitlements: [
			withFeature(overage({ id: "words", balance: -100 }), { id: "words" }),
			prepaid(),
		],
		purchasedId: ce("prepaid"),
		quantity: 600,
		expected: [{ customerEntitlementId: ce("prepaid"), delta: 600 }],
	},
];

describe("rebalance parity: server paydown and worker rebalance", () => {
	for (const parityCase of cases) {
		test(parityCase.name, () => {
			const { server, engine } = runBothLanes(parityCase);
			expect(server).toEqual(parityCase.expected);
			expect(engine).toEqual(parityCase.expected);
		});
	}
});
