/**
 * Billing-control resolution precedence: entity > customer > plan.
 *
 * Plan-level controls (snapshotted onto the customer product) are a FALLBACK —
 * they must NOT override a customer-level or entity-level control for the same
 * feature.
 */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type DbSpendLimit,
	type FullSubject,
	fullSubjectToSpendLimitByFeatureId,
} from "@autumn/shared";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

const spendLimit = (overageLimit: number): DbSpendLimit => ({
	feature_id: "messages",
	enabled: true,
	overage_limit: overageLimit,
});

const planProduct = (controls: { spend_limits?: DbSpendLimit[] }) =>
	({
		id: "cus_prod_1",
		status: CusProductStatus.Active,
		starts_at: NOW - 1000,
		access_starts_at: NOW - 1000,
		ended_at: null,
		created_at: NOW - 1000,
		spend_limits: controls.spend_limits ?? null,
	}) as unknown as FullSubject["customer_products"][number];

const buildFullSubject = ({
	entitySpendLimits,
	customerSpendLimits,
	planSpendLimits,
}: {
	entitySpendLimits?: DbSpendLimit[];
	customerSpendLimits?: DbSpendLimit[];
	planSpendLimits?: DbSpendLimit[];
}) =>
	({
		entity: entitySpendLimits ? { spend_limits: entitySpendLimits } : undefined,
		customer: { spend_limits: customerSpendLimits ?? null },
		customer_products: [planProduct({ spend_limits: planSpendLimits })],
		aggregated_customer_products: [],
	}) as unknown as FullSubject;

const resolve = (fullSubject: FullSubject) =>
	fullSubjectToSpendLimitByFeatureId({ fullSubject, featureIds: ["messages"] })
		.messages?.overage_limit;

describe("billing control hierarchy (entity > customer > plan)", () => {
	test("plan control applies when no customer/entity control exists", () => {
		const result = resolve(
			buildFullSubject({ planSpendLimits: [spendLimit(10)] }),
		);
		expect(result).toBe(10);
	});

	test("customer control wins over plan control", () => {
		const result = resolve(
			buildFullSubject({
				customerSpendLimits: [spendLimit(20)],
				planSpendLimits: [spendLimit(10)],
			}),
		);
		expect(result).toBe(20);
	});

	test("entity control wins over customer and plan controls", () => {
		const result = resolve(
			buildFullSubject({
				entitySpendLimits: [spendLimit(30)],
				customerSpendLimits: [spendLimit(20)],
				planSpendLimits: [spendLimit(10)],
			}),
		);
		expect(result).toBe(30);
	});

	test("no control anywhere resolves to undefined", () => {
		const result = resolve(buildFullSubject({}));
		expect(result).toBeUndefined();
	});
});
