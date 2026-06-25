/**
 * Billing-control resolution precedence: entity > customer > plan.
 *
 * Plan-level controls (read from the joined product) are a FALLBACK — they must
 * NOT override a customer-level or entity-level control for the same feature.
 *
 * Covers every control type that resolves through the shared
 * `resolveBillingControl` chokepoint with the entity > customer > plan shape:
 *   - spend_limits   (fullSubjectToSpendLimitByFeatureId)
 *   - overage_allowed (fullSubjectToOverageAllowedByFeatureId)
 *
 * Control types with a different hierarchy are covered separately:
 *   - auto_topups: customer > plan (no entity) — fullCustomerToAutoTopupObjects
 *   - usage_alerts: entity > customer > plan via custom scope logic — checkUsageAlerts
 *   - usage_limits: entity > customer > plan, but resolution needs feature +
 *     cusEnt context (fullSubjectToUsageWindowLimits) — exercised by the
 *     usage-window integration suite.
 */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullSubject,
	fullSubjectToOverageAllowedByFeatureId,
	fullSubjectToSpendLimitByFeatureId,
} from "@autumn/shared";

const FEATURE = "messages";
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

type ControlSpec = {
	name: string;
	key: "spend_limits" | "overage_allowed";
	// Each level's control carries a `__level` sentinel so we can assert which
	// entry actually won (object identity survives resolution).
	makeControl: (level: string) => Record<string, unknown>;
	// Resolve via the public resolver and return the winning entry's `__level`.
	resolveLevel: (fullSubject: FullSubject) => string | undefined;
};

const planProduct = (key: string, controls: Record<string, unknown>[]) =>
	({
		id: "cus_prod_1",
		status: CusProductStatus.Active,
		starts_at: NOW - 1000,
		access_starts_at: NOW - 1000,
		ended_at: null,
		created_at: NOW - 1000,
		// Plan controls live on the joined product, not the customer_product.
		product: { [key]: controls.length ? controls : null },
	}) as unknown as FullSubject["customer_products"][number];

const buildFullSubject = ({
	key,
	entity,
	customer,
	plan,
}: {
	key: string;
	entity?: Record<string, unknown>[];
	customer?: Record<string, unknown>[];
	plan?: Record<string, unknown>[];
}) =>
	({
		entity: entity ? { [key]: entity } : undefined,
		customer: { [key]: customer ?? null },
		customer_products: [planProduct(key, plan ?? [])],
		aggregated_customer_products: [],
	}) as unknown as FullSubject;

const levelOf = (control: unknown) =>
	(control as { __level?: string } | undefined)?.__level;

const SPECS: ControlSpec[] = [
	{
		name: "spend_limits",
		key: "spend_limits",
		makeControl: (level) => ({
			feature_id: FEATURE,
			enabled: true,
			overage_limit: 20,
			__level: level,
		}),
		resolveLevel: (fullSubject) =>
			levelOf(
				fullSubjectToSpendLimitByFeatureId({
					fullSubject,
					featureIds: [FEATURE],
				})[FEATURE],
			),
	},
	{
		name: "overage_allowed",
		key: "overage_allowed",
		makeControl: (level) => ({
			feature_id: FEATURE,
			enabled: true,
			__level: level,
		}),
		resolveLevel: (fullSubject) =>
			levelOf(
				fullSubjectToOverageAllowedByFeatureId({
					fullSubject,
					featureIds: [FEATURE],
				})[FEATURE],
			),
	},
];

describe("billing control hierarchy (entity > customer > plan)", () => {
	for (const spec of SPECS) {
		describe(spec.name, () => {
			test("plan applies when no customer/entity control exists", () => {
				const result = spec.resolveLevel(
					buildFullSubject({ key: spec.key, plan: [spec.makeControl("plan")] }),
				);
				expect(result).toBe("plan");
			});

			test("customer wins over plan", () => {
				const result = spec.resolveLevel(
					buildFullSubject({
						key: spec.key,
						customer: [spec.makeControl("customer")],
						plan: [spec.makeControl("plan")],
					}),
				);
				expect(result).toBe("customer");
			});

			test("entity wins over customer and plan", () => {
				const result = spec.resolveLevel(
					buildFullSubject({
						key: spec.key,
						entity: [spec.makeControl("entity")],
						customer: [spec.makeControl("customer")],
						plan: [spec.makeControl("plan")],
					}),
				);
				expect(result).toBe("entity");
			});

			test("no control anywhere resolves to undefined", () => {
				const result = spec.resolveLevel(buildFullSubject({ key: spec.key }));
				expect(result).toBeUndefined();
			});
		});
	}
});
