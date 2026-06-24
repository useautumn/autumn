/**
 * Hierarchy coverage for the control types whose precedence is NOT the plain
 * FullSubject spend-limit path (covered in billing-control-hierarchy.test.ts):
 *
 *   - resolveBillingControl chokepoint with controlLists [entity, customer]
 *     (usage_limits / overage_allowed / spend_limits) and [customer] only
 *     (auto_topups — no entity scope) → plan fallback.
 *   - usage_alerts: custom scope resolver resolveScopedUsageAlerts
 *     (entity > customer > plan), which does NOT use resolveBillingControl.
 */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type Feature,
	FeatureType,
	type FullCusProduct,
	type FullCustomer,
	resolveBillingControl,
} from "@autumn/shared";
import { resolveScopedUsageAlerts } from "@/internal/balances/trackWebhooks/checkUsageAlerts";

const FEATURE = "messages";
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

type LeveledControl = { feature_id: string; enabled: boolean; __level: string };

const control = (level: string): LeveledControl => ({
	feature_id: FEATURE,
	enabled: true,
	__level: level,
});

const planProductWith = (key: string, items: unknown[]): FullCusProduct =>
	({
		id: "cus_prod_1",
		status: CusProductStatus.Active,
		starts_at: NOW - 1000,
		access_starts_at: NOW - 1000,
		ended_at: null,
		created_at: NOW - 1000,
		[key]: items.length ? items : null,
	}) as unknown as FullCusProduct;

const matchesFeature = (c: LeveledControl) => c.feature_id === FEATURE;

describe("resolveBillingControl chokepoint", () => {
	describe("[entity, customer] then plan (spend/usage/overage shape)", () => {
		const resolve = ({
			entity,
			customer,
			plan,
		}: {
			entity?: LeveledControl[];
			customer?: LeveledControl[];
			plan?: LeveledControl[];
		}) =>
			resolveBillingControl<LeveledControl, "spend_limits">({
				controlLists: [entity ?? [], customer ?? []],
				customerProducts: [planProductWith("spend_limits", plan ?? [])],
				controlKey: "spend_limits",
				matches: matchesFeature,
			})?.__level;

		test("plan applies when no customer/entity control", () => {
			expect(resolve({ plan: [control("plan")] })).toBe("plan");
		});
		test("customer wins over plan", () => {
			expect(
				resolve({ customer: [control("customer")], plan: [control("plan")] }),
			).toBe("customer");
		});
		test("entity wins over customer and plan", () => {
			expect(
				resolve({
					entity: [control("entity")],
					customer: [control("customer")],
					plan: [control("plan")],
				}),
			).toBe("entity");
		});
		test("none resolves to undefined", () => {
			expect(resolve({})).toBeUndefined();
		});
	});

	describe("[customer] then plan (auto_topups shape — no entity scope)", () => {
		const resolve = ({
			customer,
			plan,
		}: {
			customer?: LeveledControl[];
			plan?: LeveledControl[];
		}) =>
			resolveBillingControl<LeveledControl, "auto_topups">({
				controlLists: [customer ?? []],
				customerProducts: [planProductWith("auto_topups", plan ?? [])],
				controlKey: "auto_topups",
				matches: matchesFeature,
			})?.__level;

		test("plan applies when no customer control", () => {
			expect(resolve({ plan: [control("plan")] })).toBe("plan");
		});
		test("customer wins over plan", () => {
			expect(
				resolve({ customer: [control("customer")], plan: [control("plan")] }),
			).toBe("customer");
		});
		test("none resolves to undefined", () => {
			expect(resolve({})).toBeUndefined();
		});
	});
});

describe("usage_alerts custom scope resolver (entity > customer > plan)", () => {
	const feature = {
		id: FEATURE,
		internal_id: "imessages",
		type: FeatureType.Metered,
	} as Feature;

	const alert = (level: string) => ({
		feature_id: FEATURE,
		enabled: true,
		threshold: 100,
		threshold_type: "usage",
		__level: level,
	});

	const buildFullCustomer = ({
		entity,
		customer,
		plan,
	}: {
		entity?: ReturnType<typeof alert>[];
		customer?: ReturnType<typeof alert>[];
		plan?: ReturnType<typeof alert>[];
	}) =>
		({
			usage_alerts: customer ?? null,
			entities: entity ? [{ id: "ent_1", usage_alerts: entity }] : [],
			customer_products: [planProductWith("usage_alerts", plan ?? [])],
			aggregated_customer_products: [],
		}) as unknown as FullCustomer;

	const resolveLevel = (
		fullCustomer: FullCustomer,
		entityId?: string,
	): { level?: string; scope: string } => {
		const { alerts, scope } = resolveScopedUsageAlerts({
			fullCustomer,
			feature,
			entityId,
		});
		return {
			level: (alerts[0] as { __level?: string } | undefined)?.__level,
			scope,
		};
	};

	test("plan applies when no customer/entity alert", () => {
		const { level, scope } = resolveLevel(
			buildFullCustomer({ plan: [alert("plan")] }),
		);
		expect(level).toBe("plan");
		expect(scope).toBe("plan");
	});

	test("customer wins over plan", () => {
		const { level, scope } = resolveLevel(
			buildFullCustomer({
				customer: [alert("customer")],
				plan: [alert("plan")],
			}),
		);
		expect(level).toBe("customer");
		expect(scope).toBe("customer");
	});

	test("entity wins over customer and plan", () => {
		const { level, scope } = resolveLevel(
			buildFullCustomer({
				entity: [alert("entity")],
				customer: [alert("customer")],
				plan: [alert("plan")],
			}),
			"ent_1",
		);
		expect(level).toBe("entity");
		expect(scope).toBe("entity");
	});

	test("no alert anywhere resolves to empty", () => {
		const { level } = resolveLevel(buildFullCustomer({}));
		expect(level).toBeUndefined();
	});
});
