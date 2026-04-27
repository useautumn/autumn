import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	BillingInterval,
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	PriceType,
} from "@autumn/shared";
import { computeRebalancedAutoTopUp } from "@/internal/balances/autoTopUp/compute/computeRebalancedAutoTopUp";

const createCustomerEntitlement = ({
	id,
	balance,
	quantity = 0,
	usageAllowed = false,
	entities,
	createdAt = 1,
	allowance = 0,
	entityFeatureId = null,
}: {
	id: string;
	balance: number;
	quantity?: number;
	usageAllowed?: boolean;
	entities?: Record<string, EntityBalance>;
	createdAt?: number;
	allowance?: number;
	entityFeatureId?: string | null;
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
				type: "metered",
				config: {},
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

const buildFullCustomer = (
	cusEnts: FullCusEntWithFullCusProduct[],
): FullCustomer => {
	const productsById = new Map<string, FullCusEntWithFullCusProduct[]>();
	for (const cusEnt of cusEnts) {
		const cusProduct = cusEnt.customer_product;
		if (!cusProduct) continue;
		const existing = productsById.get(cusProduct.id) ?? [];
		existing.push(cusEnt);
		productsById.set(cusProduct.id, existing);
	}

	const customer_products = Array.from(productsById.entries()).map(
		([, ents]) => {
			const sampleProduct = ents[0]?.customer_product!;
			return {
				...sampleProduct,
				customer_entitlements: ents.map((e) => ({ ...e })),
			};
		},
	);

	return {
		id: "customer-1",
		internal_id: "internal-customer",
		org_id: "org-1",
		env: "sandbox",
		customer_products,
		auto_topups: [],
		extra_customer_entitlements: [],
		invoices: [],
		entities: [],
	} as unknown as FullCustomer;
};

describe("computeRebalancedAutoTopUp", () => {
	test("1. no overage: single delta to prepaid for full quantity", () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: 200,
			usageAllowed: true,
		});
		const fullCustomer = buildFullCustomer([base, prepaid]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 600,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		expect(deltas).toEqual([
			{ cusEntId: prepaid.id, featureId: "messages", delta: 600 },
		]);
	});

	test("2. single overage cusEnt: paydown delta then prepaid remainder delta", () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: -500,
			usageAllowed: true,
		});
		const fullCustomer = buildFullCustomer([base, prepaid]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 600,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		expect(deltas).toEqual([
			{ cusEntId: base.id, featureId: "messages", delta: 500 },
			{ cusEntId: prepaid.id, featureId: "messages", delta: 100 },
		]);
	});

	test("3. overage exceeds quantity: only paydown delta, no prepaid delta", () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: -1000,
			usageAllowed: true,
		});
		const fullCustomer = buildFullCustomer([base, prepaid]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 600,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		expect(deltas).toEqual([
			{ cusEntId: base.id, featureId: "messages", delta: 600 },
		]);
	});

	test("4. prepaid cusEnt missing: empty deltas", () => {
		const base = createCustomerEntitlement({
			id: "base",
			balance: -200,
			usageAllowed: true,
		});
		const fullCustomer = buildFullCustomer([base]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 600,
			prepaidCustomerEntitlementId: "cus-ent-missing",
		});

		expect(deltas).toEqual([]);
	});

	test("5. quantity <= 0: empty deltas", () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const base = createCustomerEntitlement({
			id: "base",
			balance: -500,
			usageAllowed: true,
		});
		const fullCustomer = buildFullCustomer([base, prepaid]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 0,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		expect(deltas).toEqual([]);
	});

	test("6. entity-scoped cusEnt excluded from paydown; full quantity to prepaid", () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const entityScoped = createCustomerEntitlement({
			id: "entity-scoped",
			balance: 0,
			usageAllowed: true,
			entityFeatureId: "some-entity-feature",
			entities: {
				"entity-a": {
					id: "entity-a",
					balance: -100,
					adjustment: 0,
					additional_balance: 0,
				},
				"entity-b": {
					id: "entity-b",
					balance: -100,
					adjustment: 0,
					additional_balance: 0,
				},
			},
		});
		const fullCustomer = buildFullCustomer([entityScoped, prepaid]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 300,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		expect(deltas).toEqual([
			{ cusEntId: prepaid.id, featureId: "messages", delta: 300 },
		]);
	});

	test("7. usage_allowed sorts before non-usage_allowed", () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const nonUsageAllowed = createCustomerEntitlement({
			id: "non-usage-allowed",
			balance: -100,
			usageAllowed: false,
			createdAt: 1,
		});
		const usageAllowedCe = createCustomerEntitlement({
			id: "usage-allowed",
			balance: -100,
			usageAllowed: true,
			createdAt: 2,
		});
		const fullCustomer = buildFullCustomer([
			nonUsageAllowed,
			usageAllowedCe,
			prepaid,
		]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 150,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		expect(deltas).toEqual([
			{ cusEntId: usageAllowedCe.id, featureId: "messages", delta: 100 },
			{ cusEntId: nonUsageAllowed.id, featureId: "messages", delta: 50 },
		]);
	});

	test("8. same usage_allowed value: oldest created_at paid down first", () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const olderCe = createCustomerEntitlement({
			id: "older",
			balance: -100,
			usageAllowed: true,
			createdAt: 1,
		});
		const newerCe = createCustomerEntitlement({
			id: "newer",
			balance: -100,
			usageAllowed: true,
			createdAt: 100,
		});
		const fullCustomer = buildFullCustomer([newerCe, olderCe, prepaid]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 100,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		// Only enough to zero one cusEnt. Older (createdAt=1) paid down first.
		expect(deltas).toEqual([
			{ cusEntId: olderCe.id, featureId: "messages", delta: 100 },
		]);
	});

	test("9. multi-cusEnt paydown with prepaid remainder", () => {
		const prepaid = createCustomerEntitlement({ id: "prepaid", balance: 0 });
		const cusEntA = createCustomerEntitlement({
			id: "cus-a",
			balance: -300,
			usageAllowed: true,
			createdAt: 1,
		});
		const cusEntB = createCustomerEntitlement({
			id: "cus-b",
			balance: -200,
			usageAllowed: true,
			createdAt: 2,
		});
		const fullCustomer = buildFullCustomer([cusEntA, cusEntB, prepaid]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 1000,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		expect(deltas).toEqual([
			{ cusEntId: cusEntA.id, featureId: "messages", delta: 300 },
			{ cusEntId: cusEntB.id, featureId: "messages", delta: 200 },
			{ cusEntId: prepaid.id, featureId: "messages", delta: 500 },
		]);
	});

	test("10. prepaid cusEnt filtered from paydown pool even when it has overage", () => {
		// If the prepaid somehow has a negative balance, the paydown pool must NOT
		// include it — that's what the remainder delta is for.
		const prepaid = createCustomerEntitlement({
			id: "prepaid",
			balance: -50,
		});
		const base = createCustomerEntitlement({
			id: "base",
			balance: -100,
			usageAllowed: true,
		});
		const fullCustomer = buildFullCustomer([base, prepaid]);

		const { deltas } = computeRebalancedAutoTopUp({
			fullCustomer,
			featureId: "messages",
			quantity: 600,
			prepaidCustomerEntitlementId: prepaid.id,
		});

		expect(deltas).toEqual([
			{ cusEntId: base.id, featureId: "messages", delta: 100 },
			{ cusEntId: prepaid.id, featureId: "messages", delta: 500 },
		]);
	});
});
