/**
 * Pins the backward-compatibility contract of fullCustomerToSkipOverageBilling:
 * undefined skip_overage_billing ALWAYS resolves to billed (false). Existing
 * customers with cap-only spend limits must never have overage posting skipped.
 */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type DbSpendLimit,
	type FullCustomer,
	fullCustomerToSkipOverageBilling,
} from "@autumn/shared";

const FEATURE = "messages";
const NOW = Date.UTC(2026, 6, 8, 12, 0, 0);

const buildFullCustomer = ({
	customer,
	entity,
	plan,
}: {
	customer?: DbSpendLimit[];
	entity?: DbSpendLimit[];
	plan?: DbSpendLimit[];
}): FullCustomer =>
	({
		spend_limits: customer ?? null,
		entity: entity ? { spend_limits: entity } : undefined,
		entities: [],
		customer_products: plan
			? [
					{
						id: "cus_prod_1",
						status: CusProductStatus.Active,
						starts_at: NOW - 1000,
						access_starts_at: NOW - 1000,
						ended_at: null,
						created_at: NOW - 1000,
						customer_entitlements: [],
						product: { spend_limits: plan },
					},
				]
			: [],
	}) as unknown as FullCustomer;

const resolve = (fullCustomer: FullCustomer) =>
	fullCustomerToSkipOverageBilling({ fullCustomer, featureId: FEATURE });

describe("skip_overage_billing resolution — undefined is always billed", () => {
	test("no spend limits anywhere → billed", () => {
		expect(resolve(buildFullCustomer({}))).toBe(false);
	});

	test("existing-user shape: customer cap without skip field → billed", () => {
		const fullCustomer = buildFullCustomer({
			customer: [{ feature_id: FEATURE, enabled: true, overage_limit: 500 }],
		});
		expect(resolve(fullCustomer)).toBe(false);
	});

	test("existing-user shape: plan cap without skip field → billed", () => {
		const fullCustomer = buildFullCustomer({
			plan: [{ feature_id: FEATURE, enabled: true, overage_limit: 500 }],
		});
		expect(resolve(fullCustomer)).toBe(false);
	});

	test("skip true on a disabled entry → billed", () => {
		const fullCustomer = buildFullCustomer({
			customer: [
				{ feature_id: FEATURE, enabled: false, skip_overage_billing: true },
			],
		});
		expect(resolve(fullCustomer)).toBe(false);
	});

	test("skip true on another feature's entry → billed", () => {
		const fullCustomer = buildFullCustomer({
			customer: [
				{ feature_id: "words", enabled: true, skip_overage_billing: true },
			],
		});
		expect(resolve(fullCustomer)).toBe(false);
	});

	test("plan skip true + enabled → skipped (the only opt-in path)", () => {
		const fullCustomer = buildFullCustomer({
			plan: [
				{ feature_id: FEATURE, enabled: true, skip_overage_billing: true },
			],
		});
		expect(resolve(fullCustomer)).toBe(true);
	});

	test("customer skip false overrides plan skip true → billed", () => {
		const fullCustomer = buildFullCustomer({
			customer: [
				{ feature_id: FEATURE, enabled: true, skip_overage_billing: false },
			],
			plan: [
				{ feature_id: FEATURE, enabled: true, skip_overage_billing: true },
			],
		});
		expect(resolve(fullCustomer)).toBe(false);
	});

	test("customer cap-only entry does NOT shadow plan skip true → skipped", () => {
		const fullCustomer = buildFullCustomer({
			customer: [{ feature_id: FEATURE, enabled: true, overage_limit: 500 }],
			plan: [
				{ feature_id: FEATURE, enabled: true, skip_overage_billing: true },
			],
		});
		expect(resolve(fullCustomer)).toBe(true);
	});

	test("entity skip false overrides customer skip true → billed", () => {
		const fullCustomer = buildFullCustomer({
			entity: [
				{ feature_id: FEATURE, enabled: true, skip_overage_billing: false },
			],
			customer: [
				{ feature_id: FEATURE, enabled: true, skip_overage_billing: true },
			],
		});
		expect(resolve(fullCustomer)).toBe(false);
	});
});
