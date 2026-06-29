/**
 * Multi-plan collapse for spend_limits across mixed `limit_type` values.
 *
 * `pickStricterSpendLimit` compares raw `overage_limit` numbers, so without
 * normalization a `200%` cap can lose to a `1000` absolute cap on the
 * 200<1000 raw comparison even when the resolved percentage cap is far
 * higher. `findPlanBillingControlWithProduct` accepts a `normalizeForCompare`
 * projection that resolves percentage caps to absolute units before invoking
 * the comparator; the original (un-normalized) control is still returned to
 * the caller so downstream resolution still sees `limit_type: "usage_percentage"`.
 */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type DbSpendLimit,
	type FullCusProduct,
	resolveBillingControlWithProduct,
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
		product: { spend_limits: [spendLimit] },
	}) as unknown as FullCusProduct;

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

describe("findPlanBillingControlWithProduct — spend_limits with mixed limit_type", () => {
	test("without normalization, a looser 200% cap wrongly beats a stricter $1000 absolute cap", () => {
		// Raw comparator: 200 < 1000 -> picks 200% (a 200% cap of a 5000 allowance
		// resolves to 10000 absolute, far looser than $1000). Captures the bug
		// the normalizer fixes.
		const cheap = planProduct({
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

		const resolved = resolveBillingControlWithProduct<
			DbSpendLimit,
			"spend_limits"
		>({
			controlLists: [],
			customerProducts: [cheap, percentPlan],
			controlKey: "spend_limits",
			matches: (control) => control.feature_id === FEATURE,
			now: NOW,
		});

		expect(resolved?.control.limit_type).toBe("usage_percentage");
		expect(resolved?.control.overage_limit).toBe(200);
	});

	test("with normalization, the absolute $1000 cap correctly wins over a 200% cap of a 5000 allowance", () => {
		const cheap = planProduct({
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

		const mainPlanAllowance = 5000;
		const normalizeForCompare = (control: DbSpendLimit): DbSpendLimit => {
			if (
				control.limit_type !== "usage_percentage" ||
				control.overage_limit === undefined
			) {
				return control;
			}
			return {
				...control,
				overage_limit: (control.overage_limit / 100) * mainPlanAllowance,
				limit_type: "absolute",
			};
		};

		const resolved = resolveBillingControlWithProduct<
			DbSpendLimit,
			"spend_limits"
		>({
			controlLists: [],
			customerProducts: [cheap, percentPlan],
			controlKey: "spend_limits",
			matches: (control) => control.feature_id === FEATURE,
			now: NOW,
			normalizeForCompare,
		});

		// Picked control is the original — downstream resolveSpendLimitOverageLimit
		// still sees the absolute cap directly.
		expect(resolved?.control.limit_type).toBe("absolute");
		expect(resolved?.control.overage_limit).toBe(1000);
		expect(resolved?.customerProduct?.internal_product_id).toBe(
			"prod_absolute",
		);
	});

	test("with normalization, a 50% cap of a 5000 allowance ($2500) correctly beats a $4000 absolute cap", () => {
		// Mirror of the previous test: now the percent IS the stricter resolved
		// cap. Raw comparison would have picked the percent here too (50 < 4000)
		// but for the wrong reason.
		const loose = planProduct({
			id: "cp_loose",
			internalProductId: "prod_loose",
			createdAt: NOW - 5000,
			spendLimit: absolute(4000),
		});
		const strictPercent = planProduct({
			id: "cp_percent",
			internalProductId: "prod_percent",
			createdAt: NOW - 4000,
			spendLimit: percent(50),
		});

		const mainPlanAllowance = 5000;
		const normalizeForCompare = (control: DbSpendLimit): DbSpendLimit => {
			if (
				control.limit_type !== "usage_percentage" ||
				control.overage_limit === undefined
			) {
				return control;
			}
			return {
				...control,
				overage_limit: (control.overage_limit / 100) * mainPlanAllowance,
				limit_type: "absolute",
			};
		};

		const resolved = resolveBillingControlWithProduct<
			DbSpendLimit,
			"spend_limits"
		>({
			controlLists: [],
			customerProducts: [loose, strictPercent],
			controlKey: "spend_limits",
			matches: (control) => control.feature_id === FEATURE,
			now: NOW,
			normalizeForCompare,
		});

		expect(resolved?.control.limit_type).toBe("usage_percentage");
		expect(resolved?.control.overage_limit).toBe(50);
		expect(resolved?.customerProduct?.internal_product_id).toBe(
			"prod_percent",
		);
	});

	test("unresolvable percent (no allowance) is treated as no-cap and absolute wins", () => {
		// resolveSpendLimitOverageLimit returns undefined when denominator is 0;
		// pickStricterSpendLimit's `?? Number.POSITIVE_INFINITY` then means the
		// percent is the loosest possible cap, so any absolute cap wins.
		const cheap = planProduct({
			id: "cp_absolute",
			internalProductId: "prod_absolute",
			createdAt: NOW - 5000,
			spendLimit: absolute(50),
		});
		const percentPlan = planProduct({
			id: "cp_percent",
			internalProductId: "prod_percent",
			createdAt: NOW - 4000,
			spendLimit: percent(500),
		});

		const normalizeForCompare = (control: DbSpendLimit): DbSpendLimit => {
			if (control.limit_type !== "usage_percentage") return control;
			return { ...control, overage_limit: undefined, limit_type: "absolute" };
		};

		const resolved = resolveBillingControlWithProduct<
			DbSpendLimit,
			"spend_limits"
		>({
			controlLists: [],
			customerProducts: [cheap, percentPlan],
			controlKey: "spend_limits",
			matches: (control) => control.feature_id === FEATURE,
			now: NOW,
			normalizeForCompare,
		});

		expect(resolved?.control.limit_type).toBe("absolute");
		expect(resolved?.control.overage_limit).toBe(50);
	});
});
