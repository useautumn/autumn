import { describe, expect, test } from "bun:test";
import {
	type FullCustomer,
	type FullCustomerSchedule,
	CusProductStatus,
	type ProductV2,
	AppEnv,
} from "@autumn/shared";
import type { FullCusProduct } from "@autumn/shared";
import {
	cusProductToPlan,
	buildInitialValues,
	getScheduleForScope,
} from "@/views/customers2/components/sheets/CreateScheduleSheet";
import { EMPTY_SCHEDULE_PLAN } from "@/components/forms/create-schedule/createScheduleFormSchema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProduct({
	id = "prod_1",
	name = "Pro Plan",
	items = [],
}: {
	id?: string;
	name?: string;
	items?: ProductV2["items"];
} = {}): ProductV2 {
	return {
		id,
		name,
		is_add_on: false,
		is_default: false,
		version: 1,
		group: null,
		env: AppEnv.Sandbox,
		items,
		created_at: Date.now(),
	};
}

function makeFixedPrice({
	id = "price_base",
	internalProductId = "int_prod_1",
	amount = 2000,
	interval = "month",
}: {
	id?: string;
	internalProductId?: string;
	amount?: number;
	interval?: string;
} = {}) {
	return {
		id,
		internal_product_id: internalProductId,
		config: {
			type: "fixed",
			amount,
			interval,
			interval_count: 1,
		},
		entitlement_id: null,
		proration_config: null,
	};
}

function makeUsagePrice({
	id = "price_usage",
	internalProductId = "int_prod_1",
	entitlementId = "ent_1",
	featureId = "api_calls",
	interval = "month",
	tiers = [{ to: -1, amount: 0.01 }],
}: {
	id?: string;
	internalProductId?: string;
	entitlementId?: string;
	featureId?: string;
	interval?: string;
	tiers?: Array<{ to: number; amount: number }>;
} = {}) {
	return {
		id,
		internal_product_id: internalProductId,
		config: {
			type: "usage",
			bill_when: "end_of_period",
			billing_units: 1,
			internal_feature_id: `int_${featureId}`,
			feature_id: featureId,
			usage_tiers: tiers,
			interval,
			interval_count: 1,
		},
		entitlement_id: entitlementId,
		proration_config: null,
	};
}

function makeEntitlementWithFeature({
	id = "ent_1",
	internalProductId = "int_prod_1",
	featureId = "api_calls",
	featureName = "API Calls",
	allowance = 1000,
	interval = "month",
}: {
	id?: string;
	internalProductId?: string;
	featureId?: string;
	featureName?: string;
	allowance?: number;
	interval?: string;
} = {}) {
	return {
		id,
		created_at: Date.now(),
		internal_feature_id: `int_${featureId}`,
		internal_product_id: internalProductId,
		is_custom: false,
		allowance_type: "fixed" as const,
		allowance,
		interval,
		interval_count: 1,
		carry_from_previous: false,
		entity_feature_id: null,
		feature_id: featureId,
		usage_limit: null,
		rollover: null,
		feature: {
			id: featureId,
			name: featureName,
			type: "usage",
			internal_id: `int_${featureId}`,
			created_at: Date.now(),
			org_id: "org_1",
		},
	};
}

function makeCusProduct({
	id = "cp_1",
	productId = "prod_1",
	isCustom = false,
	status = CusProductStatus.Active,
	customerPrices = [] as any[],
	customerEntitlements = [] as any[],
	options = [] as any[],
}: {
	id?: string;
	productId?: string;
	isCustom?: boolean;
	status?: CusProductStatus;
	customerPrices?: any[];
	customerEntitlements?: any[];
	options?: any[];
} = {}): FullCusProduct {
	return {
		id,
		internal_product_id: `int_${productId}`,
		product_id: productId,
		internal_customer_id: "int_cus_1",
		customer_id: "cus_1",
		status,
		is_custom: isCustom,
		options,
		customer_prices: customerPrices,
		customer_entitlements: customerEntitlements,
		product: { id: productId, name: "Plan", internal_id: `int_${productId}` } as any,
		billing_version: "v2",
		external_id: null,
	} as FullCusProduct;
}

function makeCustomer({
	customerProducts = [],
	schedule,
}: {
	customerProducts?: FullCusProduct[];
	schedule?: FullCustomerSchedule;
} = {}): FullCustomer {
	return {
		internal_id: "int_cus_1",
		id: "cus_1",
		name: "Test Customer",
		email: "test@example.com",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		created_at: Date.now(),
		customer_products: customerProducts,
		entities: [],
		extra_customer_entitlements: [],
		schedule,
	} as unknown as FullCustomer;
}

// ---------------------------------------------------------------------------
// cusProductToPlan
// ---------------------------------------------------------------------------

describe("cusProductToPlan", () => {
	test("returns items: null for non-custom product", () => {
		const cusProduct = makeCusProduct({ productId: "prod_1", isCustom: false });
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.productId).toBe("prod_1");
		expect(plan.items).toBeNull();
	});

	test("reconstructs base price item from custom customer product", () => {
		const basePrice = makeFixedPrice({ amount: 5000, interval: "month" });
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [{ id: "cp_price_1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.items).not.toBeNull();
		expect(plan.items!.length).toBe(1);

		const priceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		expect(priceItem).toBeDefined();
		expect(priceItem!.price).toBe(5000);
		expect(priceItem!.interval).toBe("month");
	});

	test("reconstructs feature items from custom customer product", () => {
		const usagePrice = makeUsagePrice({
			entitlementId: "ent_1",
			featureId: "api_calls",
			tiers: [{ to: -1, amount: 0.02 }],
		});
		const entitlement = makeEntitlementWithFeature({
			id: "ent_1",
			featureId: "api_calls",
			allowance: 2000,
		});
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [{ id: "cp_price_1", price: usagePrice } as any],
			customerEntitlements: [
				{ id: "ce_1", entitlement, replaceables: [], rollovers: [] } as any,
			],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.items).not.toBeNull();
		expect(plan.items!.length).toBeGreaterThanOrEqual(1);

		const featureItem = plan.items!.find(
			(item) => item.feature_id === "api_calls",
		);
		expect(featureItem).toBeDefined();
		expect(featureItem!.tiers).toBeDefined();
		expect(featureItem!.tiers!.length).toBe(1);
		expect(featureItem!.tiers![0].amount).toBe(0.02);
	});

	test("reconstructs both base price and feature items for fully custom product", () => {
		const basePrice = makeFixedPrice({ amount: 9900 });
		const usagePrice = makeUsagePrice({
			entitlementId: "ent_1",
			featureId: "seats",
			tiers: [{ to: -1, amount: 10 }],
		});
		const entitlement = makeEntitlementWithFeature({
			id: "ent_1",
			featureId: "seats",
			featureName: "Seats",
			allowance: 5,
		});
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [
				{ id: "cp_p1", price: basePrice } as any,
				{ id: "cp_p2", price: usagePrice } as any,
			],
			customerEntitlements: [
				{ id: "ce_1", entitlement, replaceables: [], rollovers: [] } as any,
			],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.items).not.toBeNull();
		const priceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		const featureItem = plan.items!.find(
			(item) => item.feature_id === "seats",
		);
		expect(priceItem).toBeDefined();
		expect(priceItem!.price).toBe(9900);
		expect(featureItem).toBeDefined();
	});

	test("returns null items when no prices/entitlements even if is_custom", () => {
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [],
			customerEntitlements: [],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.items).toBeNull();
		expect(plan.isCustom).toBe(true);
	});

	test("detects isCustom from price-level is_custom when cusProduct.is_custom is false", () => {
		const basePrice = makeFixedPrice({ amount: 3000, interval: "month" });
		(basePrice as any).is_custom = true;
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: false,
			customerPrices: [{ id: "cp_price_1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.isCustom).toBe(true);
		expect(plan.items).not.toBeNull();
		expect(plan.items!.find((item) => item.price != null && !item.feature_id)!.price).toBe(3000);
	});

	test("detects isCustom from entitlement-level is_custom when cusProduct.is_custom is false", () => {
		const entitlement = makeEntitlementWithFeature({
			id: "ent_1",
			featureId: "api_calls",
			allowance: 500,
		});
		(entitlement as any).is_custom = true;
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: false,
			customerPrices: [],
			customerEntitlements: [
				{ id: "ce_1", entitlement, replaceables: [], rollovers: [] } as any,
			],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.isCustom).toBe(true);
	});

	test("isCustom is false when no custom flags at any level", () => {
		const basePrice = makeFixedPrice({ amount: 2000, interval: "month" });
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: false,
			customerPrices: [{ id: "cp_price_1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.isCustom).toBe(false);
	});

	test("custom plan with boolean + base price + prepaid includes all items", () => {
		const basePrice = makeFixedPrice({ amount: 1500, interval: "month" });
		const usagePrice = makeUsagePrice({
			id: "price_users",
			entitlementId: "ent_users",
			featureId: "users",
			tiers: [{ to: -1, amount: 10 }],
		});
		const usersEntitlement = makeEntitlementWithFeature({
			id: "ent_users",
			featureId: "users",
			featureName: "Users",
			allowance: 0,
		});
		const booleanEntitlement = {
			id: "ent_admin",
			created_at: Date.now(),
			internal_feature_id: "int_admin_rights",
			internal_product_id: "int_prod_1",
			is_custom: true,
			allowance_type: null,
			allowance: null,
			interval: null,
			interval_count: 1,
			carry_from_previous: false,
			entity_feature_id: null,
			feature_id: "admin_rights",
			usage_limit: null,
			rollover: null,
			feature: {
				id: "admin_rights",
				name: "Admin Rights",
				type: "boolean",
				internal_id: "int_admin_rights",
				created_at: Date.now(),
				org_id: "org_1",
			},
		};
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: true,
			customerPrices: [
				{ id: "cp_p1", price: basePrice } as any,
				{ id: "cp_p2", price: usagePrice } as any,
			],
			customerEntitlements: [
				{
					id: "ce_users",
					entitlement: usersEntitlement,
					replaceables: [],
					rollovers: [],
				} as any,
				{
					id: "ce_admin",
					entitlement: booleanEntitlement,
					replaceables: [],
					rollovers: [],
				} as any,
			],
		});
		const products = [
			makeProduct({
				id: "prod_1",
				items: [
					{ feature_id: "users", usage_model: "prepaid" } as any,
				],
			}),
		];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.isCustom).toBe(true);
		expect(plan.items).not.toBeNull();

		const basePriceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		expect(basePriceItem).toBeDefined();
		expect(basePriceItem!.price).toBe(1500);

		const usersItem = plan.items!.find(
			(item) => item.feature_id === "users",
		);
		expect(usersItem).toBeDefined();

		const adminItem = plan.items!.find(
			(item) => item.feature_id === "admin_rights",
		);
		expect(adminItem).toBeDefined();
		expect(adminItem!.feature_id).toBe("admin_rights");
	});

	test("custom plan includes product catalog items missing from customer data", () => {
		const basePrice = makeFixedPrice({ amount: 2000, interval: "month" });
		(basePrice as any).is_custom = true;
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			isCustom: false,
			customerPrices: [{ id: "cp_p1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const products = [
			makeProduct({
				id: "prod_1",
				items: [
					{
						feature_id: "dashboard",
						type: "feature",
					} as any,
				],
			}),
		];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.isCustom).toBe(true);
		expect(plan.items).not.toBeNull();

		const dashboardItem = plan.items!.find(
			(item) => item.feature_id === "dashboard",
		);
		expect(dashboardItem).toBeDefined();

		const priceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		expect(priceItem).toBeDefined();
		expect(priceItem!.price).toBe(2000);
	});

	test("computes prepaid options from backend options", () => {
		const cusProduct = makeCusProduct({
			productId: "prod_1",
			options: [{ feature_id: "credits", quantity: 500 }],
		});
		const products = [
			makeProduct({
				id: "prod_1",
				items: [
					{ feature_id: "credits", usage_model: "prepaid" } as any,
				],
			}),
		];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.prepaidOptions).toBeDefined();
		expect(plan.prepaidOptions.credits).toBe(500);
	});

	test("returns empty prepaidOptions when product has no prepaid items", () => {
		const cusProduct = makeCusProduct({ productId: "prod_1" });
		const products = [makeProduct({ id: "prod_1", items: [] })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.prepaidOptions).toEqual({});
	});

	test("handles missing product in products list gracefully", () => {
		const cusProduct = makeCusProduct({ productId: "prod_999" });
		const products = [makeProduct({ id: "prod_1" })];

		const plan = cusProductToPlan({ cusProduct, products });

		expect(plan.productId).toBe("prod_999");
		expect(plan.prepaidOptions).toEqual({});
		expect(plan.items).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// buildInitialValues
// ---------------------------------------------------------------------------

describe("buildInitialValues", () => {
	const products = [makeProduct({ id: "prod_1" }), makeProduct({ id: "prod_2", name: "Starter" })];

	test("maps existing schedule phases to form phases", () => {
		const cusProduct1 = makeCusProduct({ id: "cp_1", productId: "prod_1" });
		const cusProduct2 = makeCusProduct({ id: "cp_2", productId: "prod_2" });
		const customer = makeCustomer({ customerProducts: [cusProduct1, cusProduct2] });
		const schedule: FullCustomerSchedule = {
			id: "sched_1",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			internal_customer_id: "int_cus_1",
			customer_id: "cus_1",
			internal_entity_id: null,
			entity_id: null,
			created_at: Date.now(),
			phases: [
				{ id: "phase_1", schedule_id: "sched_1", starts_at: 1000, customer_product_ids: ["cp_1"], created_at: 1000 },
				{ id: "phase_2", schedule_id: "sched_1", starts_at: 2000, customer_product_ids: ["cp_2"], created_at: 1000 },
			],
		};

		const result = buildInitialValues({ customer, schedule, products });

		expect(result.phases).toHaveLength(2);
		expect(result.phases[0].startsAt).toBe(1000);
		expect(result.phases[0].persistedStartsAt).toBe(1000);
		expect(result.phases[0].plans).toHaveLength(1);
		expect(result.phases[0].plans[0].productId).toBe("prod_1");
		expect(result.phases[1].startsAt).toBe(2000);
		expect(result.phases[1].plans[0].productId).toBe("prod_2");
	});

	test("falls back to EMPTY_SCHEDULE_PLAN for missing customer product", () => {
		const customer = makeCustomer({ customerProducts: [] });
		const schedule: FullCustomerSchedule = {
			id: "sched_1",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			internal_customer_id: "int_cus_1",
			customer_id: "cus_1",
			internal_entity_id: null,
			entity_id: null,
			created_at: Date.now(),
			phases: [
				{ id: "phase_1", schedule_id: "sched_1", starts_at: 1000, customer_product_ids: ["cp_missing"], created_at: 1000 },
			],
		};

		const result = buildInitialValues({ customer, schedule, products });

		expect(result.phases[0].plans[0]).toEqual(EMPTY_SCHEDULE_PLAN);
	});

	test("preserves custom items for custom customer products in schedule phases", () => {
		const basePrice = makeFixedPrice({ amount: 4200 });
		const customCusProduct = makeCusProduct({
			id: "cp_custom",
			productId: "prod_1",
			isCustom: true,
			customerPrices: [{ id: "cp_p1", price: basePrice } as any],
			customerEntitlements: [],
		});
		const customer = makeCustomer({ customerProducts: [customCusProduct] });
		const schedule: FullCustomerSchedule = {
			id: "sched_1",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			internal_customer_id: "int_cus_1",
			customer_id: "cus_1",
			internal_entity_id: null,
			entity_id: null,
			created_at: Date.now(),
			phases: [
				{ id: "phase_1", schedule_id: "sched_1", starts_at: 1000, customer_product_ids: ["cp_custom"], created_at: 1000 },
			],
		};

		const result = buildInitialValues({ customer, schedule, products });

		const plan = result.phases[0].plans[0];
		expect(plan.items).not.toBeNull();
		const priceItem = plan.items!.find(
			(item) => item.price != null && !item.feature_id,
		);
		expect(priceItem!.price).toBe(4200);
	});

	test("uses active customer products when no schedule exists", () => {
		const activeCp = makeCusProduct({
			id: "cp_1",
			productId: "prod_1",
			status: CusProductStatus.Active,
		});
		const scheduledCp = makeCusProduct({
			id: "cp_2",
			productId: "prod_2",
			status: CusProductStatus.Scheduled,
		});
		const customer = makeCustomer({ customerProducts: [activeCp, scheduledCp] });

		const result = buildInitialValues({ customer, schedule: undefined, products });

		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].startsAt).toBeNull();
		expect(result.phases[0].plans).toHaveLength(1);
		expect(result.phases[0].plans[0].productId).toBe("prod_1");
	});

	test("excludes canceled customer products from initial active plans", () => {
		const activeCp = makeCusProduct({
			id: "cp_1",
			productId: "prod_1",
			status: CusProductStatus.Active,
		});
		const canceledCp = makeCusProduct({
			id: "cp_2",
			productId: "prod_2",
			status: CusProductStatus.Active,
		});
		(canceledCp as any).canceled_at = Date.now();
		const customer = makeCustomer({ customerProducts: [activeCp, canceledCp] });

		const result = buildInitialValues({ customer, schedule: undefined, products });

		expect(result.phases[0].plans).toHaveLength(1);
		expect(result.phases[0].plans[0].productId).toBe("prod_1");
	});

	test("returns single empty plan when no active products and no schedule", () => {
		const customer = makeCustomer({ customerProducts: [] });

		const result = buildInitialValues({ customer, schedule: undefined, products });

		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].plans).toHaveLength(1);
		expect(result.phases[0].plans[0]).toEqual(EMPTY_SCHEDULE_PLAN);
	});

	test("handles undefined customer gracefully", () => {
		const result = buildInitialValues({ customer: undefined, schedule: undefined, products });

		expect(result.phases).toHaveLength(1);
		expect(result.phases[0].plans).toHaveLength(1);
		expect(result.phases[0].plans[0]).toEqual(EMPTY_SCHEDULE_PLAN);
	});

	test("filters active plans by entity when entityId is set", () => {
		const entityCp = makeCusProduct({
			id: "cp_ent",
			productId: "prod_1",
			status: CusProductStatus.Active,
		});
		(entityCp as any).entity_id = "ent_1";
		const customerCp = makeCusProduct({
			id: "cp_cus",
			productId: "prod_2",
			status: CusProductStatus.Active,
		});
		(customerCp as any).entity_id = null;
		const customer = makeCustomer({ customerProducts: [entityCp, customerCp] });

		const entityResult = buildInitialValues({
			customer,
			schedule: undefined,
			products,
			entityId: "ent_1",
		});
		expect(entityResult.phases[0].plans).toHaveLength(1);
		expect(entityResult.phases[0].plans[0].productId).toBe("prod_1");

		const customerResult = buildInitialValues({
			customer,
			schedule: undefined,
			products,
			entityId: undefined,
		});
		expect(customerResult.phases[0].plans).toHaveLength(1);
		expect(customerResult.phases[0].plans[0].productId).toBe("prod_2");
	});

	test("uses page-level entity schedule when entity is selected", () => {
		const entitySchedule: FullCustomerSchedule = {
			id: "sched_entity",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			internal_customer_id: "int_cus_1",
			customer_id: "cus_1",
			internal_entity_id: "int_ent_1",
			entity_id: "ent_1",
			created_at: Date.now(),
			phases: [
				{ id: "phase_e1", schedule_id: "sched_entity", starts_at: 5000, customer_product_ids: ["cp_3"], created_at: 5000 },
			],
		};
		const customerSchedule: FullCustomerSchedule = {
			id: "sched_cus",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			internal_customer_id: "int_cus_1",
			customer_id: "cus_1",
			internal_entity_id: null,
			entity_id: null,
			created_at: Date.now(),
			phases: [
				{ id: "phase_c1", schedule_id: "sched_cus", starts_at: 1000, customer_product_ids: ["cp_1"], created_at: 1000 },
			],
		};
		const customer = makeCustomer({
			customerProducts: [],
			schedule: customerSchedule,
		});
		(customer as any).entities = [
			{ id: "ent_1", internal_id: "int_ent_1", schedule: entitySchedule },
		];

		const result = getScheduleForScope({ customer, entityId: "ent_1" });
		expect(result).toBeDefined();
		expect(result!.id).toBe("sched_entity");
	});

	test("returns customer-level schedule when no entity selected", () => {
		const customerSchedule: FullCustomerSchedule = {
			id: "sched_cus",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			internal_customer_id: "int_cus_1",
			customer_id: "cus_1",
			internal_entity_id: null,
			entity_id: null,
			created_at: Date.now(),
			phases: [
				{ id: "phase_c1", schedule_id: "sched_cus", starts_at: 1000, customer_product_ids: ["cp_1"], created_at: 1000 },
			],
		};
		const customer = makeCustomer({
			customerProducts: [],
			schedule: customerSchedule,
		});

		const result = getScheduleForScope({ customer, entityId: undefined });
		expect(result).toBeDefined();
		expect(result!.id).toBe("sched_cus");
	});

	test("returns undefined when entity has no schedule", () => {
		const customer = makeCustomer({ customerProducts: [] });
		(customer as any).entities = [
			{ id: "ent_1", internal_id: "int_ent_1" },
		];

		const result = getScheduleForScope({ customer, entityId: "ent_1" });
		expect(result).toBeUndefined();
	});

	test("returns undefined when entity not found", () => {
		const customer = makeCustomer({ customerProducts: [] });

		const result = getScheduleForScope({ customer, entityId: "nonexistent" });
		expect(result).toBeUndefined();
	});

	test("maps multiple plans per phase", () => {
		const cp1 = makeCusProduct({ id: "cp_1", productId: "prod_1" });
		const cp2 = makeCusProduct({ id: "cp_2", productId: "prod_2" });
		const customer = makeCustomer({ customerProducts: [cp1, cp2] });
		const schedule: FullCustomerSchedule = {
			id: "sched_1",
			org_id: "org_1",
			env: AppEnv.Sandbox,
			internal_customer_id: "int_cus_1",
			customer_id: "cus_1",
			internal_entity_id: null,
			entity_id: null,
			created_at: Date.now(),
			phases: [
				{ id: "phase_1", schedule_id: "sched_1", starts_at: 1000, customer_product_ids: ["cp_1", "cp_2"], created_at: 1000 },
			],
		};

		const result = buildInitialValues({ customer, schedule, products });

		expect(result.phases[0].plans).toHaveLength(2);
		expect(result.phases[0].plans[0].productId).toBe("prod_1");
		expect(result.phases[0].plans[1].productId).toBe("prod_2");
	});
});
