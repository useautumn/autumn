import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type DbSpendLimit,
	type FullCusProduct,
	type FullSubject,
	mergePlanBillingControlsForResponse,
} from "@autumn/shared";

const FEATURE = "messages";
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

const planProduct = ({
	id,
	internalProductId,
	createdAt,
	spendLimit,
}: {
	id: string;
	internalProductId: string;
	createdAt: number;
	spendLimit: DbSpendLimit;
}): FullCusProduct =>
	({
		id,
		internal_product_id: internalProductId,
		status: CusProductStatus.Active,
		starts_at: NOW - 10_000,
		access_starts_at: NOW - 10_000,
		ended_at: null,
		created_at: createdAt,
		customer_entitlements: [],
		product: { spend_limits: [spendLimit] },
	}) as unknown as FullCusProduct;

const subjectWith = ({
	customerProducts,
	allowance,
}: {
	customerProducts: FullCusProduct[];
	allowance: number;
}): FullSubject =>
	({
		subjectType: "customer",
		customer: {},
		customer_products: customerProducts,
		extra_customer_entitlements: [],
		aggregated_customer_entitlements: [
			{ feature_id: FEATURE, allowance_total: allowance },
		],
	}) as unknown as FullSubject;

const absolute = (overageLimit: number): DbSpendLimit => ({
	feature_id: FEATURE,
	enabled: true,
	limit_type: "absolute",
	overage_limit: overageLimit,
});

const percent = (percentage: number): DbSpendLimit => ({
	feature_id: FEATURE,
	enabled: true,
	limit_type: "usage_percentage",
	overage_limit: percentage,
});

describe("mergePlanBillingControlsForResponse — spend_limits across plans", () => {
	test("mixed limit types: the $1000 absolute cap beats a 200% cap of a 5000 allowance", () => {
		const absolutePlan = planProduct({
			id: "cp_absolute",
			internalProductId: "prod_absolute",
			createdAt: NOW - 5000,
			spendLimit: absolute(1000),
		});
		const percentPlan = planProduct({
			id: "cp_percent",
			internalProductId: "prod_percent",
			createdAt: NOW - 4000,
			spendLimit: percent(200),
		});
		const fullSubject = subjectWith({
			customerProducts: [absolutePlan, percentPlan],
			allowance: 5000,
		});

		const merged = mergePlanBillingControlsForResponse({
			billingControls: {},
			planCustomerProducts: fullSubject.customer_products,
			fullSubject,
		});

		expect(merged.spend_limits).toHaveLength(1);
		expect(merged.spend_limits?.[0]).toMatchObject({
			feature_id: FEATURE,
			limit_type: "absolute",
			overage_limit: 1000,
			source: "plan",
		});
	});

	test("a customer-level entry shadows both plan entries and is tagged customer", () => {
		const absolutePlan = planProduct({
			id: "cp_absolute",
			internalProductId: "prod_absolute",
			createdAt: NOW - 5000,
			spendLimit: absolute(1000),
		});
		const percentPlan = planProduct({
			id: "cp_percent",
			internalProductId: "prod_percent",
			createdAt: NOW - 4000,
			spendLimit: percent(200),
		});
		const fullSubject = subjectWith({
			customerProducts: [absolutePlan, percentPlan],
			allowance: 5000,
		});

		const merged = mergePlanBillingControlsForResponse({
			billingControls: { spend_limits: [absolute(50)] },
			planCustomerProducts: fullSubject.customer_products,
			fullSubject,
		});

		expect(merged.spend_limits).toHaveLength(1);
		expect(merged.spend_limits?.[0]).toMatchObject({
			overage_limit: 50,
			source: "customer",
		});
	});
});
