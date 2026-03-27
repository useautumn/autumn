import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	BillingInterval,
	type EntityBalance,
	type FullCusEntWithFullCusProduct,
	PriceType,
} from "@autumn/shared";
import { deductFromCusEntsTypescript } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript";

const createCustomerEntitlement = ({
	id,
	balance,
	adjustment = 0,
	quantity = 0,
	usageAllowed = false,
	entities,
}: {
	id: string;
	balance: number;
	adjustment?: number;
	quantity?: number;
	usageAllowed?: boolean;
	entities?: Record<string, EntityBalance>;
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
		created_at: 1,
		unlimited: false,
		balance,
		additional_balance: 0,
		adjustment,
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
			allowance: 0,
			interval: BillingInterval.Month,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: null,
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

describe("deductFromCusEntsTypescript", () => {
	test("refund: positive usage bucket stays full while prepaid bucket grows", () => {
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 0,
			quantity: 6,
			usageAllowed: false,
		});
		const usageCustomerEntitlement = createCustomerEntitlement({
			id: "usage",
			balance: 100,
			quantity: 0,
			usageAllowed: true,
		});

		const { updates, remaining } = deductFromCusEntsTypescript({
			cusEnts: [prepaidCustomerEntitlement, usageCustomerEntitlement],
			amountToDeduct: -600,
			allowOverage: true,
		});

		expect(remaining).toBe(0);
		expect(updates[prepaidCustomerEntitlement.id]?.balance).toBe(600);
		expect(updates[usageCustomerEntitlement.id]?.balance).toBe(100);
	});

	test("refund pass 1: only negative balances are healed toward zero", () => {
		const negativeCustomerEntitlement = createCustomerEntitlement({
			id: "negative",
			balance: -40,
			usageAllowed: true,
		});
		const positiveCustomerEntitlement = createCustomerEntitlement({
			id: "positive",
			balance: 100,
			usageAllowed: true,
		});

		const { updates, remaining } = deductFromCusEntsTypescript({
			cusEnts: [negativeCustomerEntitlement, positiveCustomerEntitlement],
			amountToDeduct: -30,
			allowOverage: false,
		});

		expect(remaining).toBe(0);
		expect(updates[negativeCustomerEntitlement.id]?.balance).toBe(-10);
		expect(updates[positiveCustomerEntitlement.id]).toBeUndefined();
	});

	test("refund pass 2: caps at starting balance when overage is not allowed", () => {
		const cappedCustomerEntitlement = createCustomerEntitlement({
			id: "capped",
			balance: 0,
			quantity: 3,
			usageAllowed: false,
		});

		const { updates, remaining } = deductFromCusEntsTypescript({
			cusEnts: [cappedCustomerEntitlement],
			amountToDeduct: -500,
			allowOverage: false,
		});

		expect(updates[cappedCustomerEntitlement.id]?.balance).toBe(300);
		expect(remaining).toBe(-200);
	});

	test("deduction: prepaid drains before usage-based overage", () => {
		const prepaidCustomerEntitlement = createCustomerEntitlement({
			id: "prepaid",
			balance: 300,
			quantity: 3,
			usageAllowed: false,
		});
		const usageCustomerEntitlement = createCustomerEntitlement({
			id: "usage",
			balance: 0,
			usageAllowed: true,
		});

		const { updates, remaining } = deductFromCusEntsTypescript({
			cusEnts: [prepaidCustomerEntitlement, usageCustomerEntitlement],
			amountToDeduct: 450,
			allowOverage: true,
		});

		expect(remaining).toBe(0);
		expect(updates[prepaidCustomerEntitlement.id]?.balance).toBe(0);
		expect(updates[usageCustomerEntitlement.id]?.balance).toBe(-150);
	});

	test("entity target: only the targeted entity balance is refunded", () => {
		const entityCustomerEntitlement = createCustomerEntitlement({
			id: "entity",
			balance: 0,
			usageAllowed: false,
			entities: {
				"entity-1": {
					id: "entity-1",
					balance: 0,
					adjustment: 0,
					additional_balance: 0,
				},
				"entity-2": {
					id: "entity-2",
					balance: 100,
					adjustment: 0,
					additional_balance: 0,
				},
			},
		});

		const { updates, remaining } = deductFromCusEntsTypescript({
			cusEnts: [entityCustomerEntitlement],
			amountToDeduct: -50,
			targetEntityId: "entity-1",
			allowOverage: true,
		});

		expect(remaining).toBe(0);
		expect(updates[entityCustomerEntitlement.id]?.entities?.["entity-1"]?.balance).toBe(
			50,
		);
		expect(updates[entityCustomerEntitlement.id]?.entities?.["entity-2"]?.balance).toBe(
			100,
		);
	});
});
