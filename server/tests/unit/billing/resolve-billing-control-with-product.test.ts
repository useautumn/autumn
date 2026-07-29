/**
 * resolveBillingControlWithProduct reports WHICH plan a control resolved from.
 * Auto-topup price scoping relies on this: a plan-resolved config must charge
 * that plan's price, never another plan's price for the same feature.
 *
 * For auto_topups (no most-restrictive collapse) the recency winner — the most
 * recently attached plan with a matching control — must win AND be reported as
 * the source `customerProduct`.
 */

import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	type FullCusProduct,
	resolveBillingControlWithProduct,
} from "@autumn/shared";

const FEATURE = "messages";
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

type AutoTopupLike = {
	feature_id: string;
	enabled: boolean;
	quantity: number;
};

const planProduct = ({
	id,
	internalProductId,
	createdAt,
	quantity,
}: {
	id: string;
	internalProductId: string;
	createdAt: number;
	quantity: number;
}): FullCusProduct =>
	({
		id,
		internal_product_id: internalProductId,
		status: CusProductStatus.Active,
		starts_at: NOW - 10_000,
		access_starts_at: NOW - 10_000,
		ended_at: null,
		created_at: createdAt,
		product: {
			auto_topups: [
				{ feature_id: FEATURE, enabled: true, quantity } satisfies AutoTopupLike,
			],
		},
	}) as unknown as FullCusProduct;

const resolve = (customerProducts: FullCusProduct[]) =>
	resolveBillingControlWithProduct<AutoTopupLike, "auto_topups">({
		controlLists: [null],
		customerProducts,
		controlKey: "auto_topups",
		matches: (config) => config.feature_id === FEATURE,
		now: NOW,
	});

describe("resolveBillingControlWithProduct — auto_topups recency + source plan", () => {
	test("reports the most recently attached plan as the source", () => {
		const base = planProduct({
			id: "cp_base",
			internalProductId: "prod_base",
			createdAt: NOW - 5000,
			quantity: 100,
		});
		const addOn = planProduct({
			id: "cp_addon",
			internalProductId: "prod_addon",
			createdAt: NOW - 1000, // attached later
			quantity: 300,
		});

		// Order in the array shouldn't matter — recency (created_at) decides.
		const resolved = resolve([base, addOn]);

		expect(resolved?.control.quantity).toBe(300);
		expect(resolved?.customerProduct?.internal_product_id).toBe("prod_addon");
	});

	test("recency wins regardless of array order (addon first)", () => {
		const base = planProduct({
			id: "cp_base",
			internalProductId: "prod_base",
			createdAt: NOW - 5000,
			quantity: 100,
		});
		const addOn = planProduct({
			id: "cp_addon",
			internalProductId: "prod_addon",
			createdAt: NOW - 1000,
			quantity: 300,
		});

		const resolved = resolve([addOn, base]);

		expect(resolved?.control.quantity).toBe(300);
		expect(resolved?.customerProduct?.internal_product_id).toBe("prod_addon");
	});

	test("customer-level control reports no source plan", () => {
		const base = planProduct({
			id: "cp_base",
			internalProductId: "prod_base",
			createdAt: NOW - 5000,
			quantity: 100,
		});

		const resolved = resolveBillingControlWithProduct<
			AutoTopupLike,
			"auto_topups"
		>({
			controlLists: [
				[{ feature_id: FEATURE, enabled: true, quantity: 999 }],
			],
			customerProducts: [base],
			controlKey: "auto_topups",
			matches: (config) => config.feature_id === FEATURE,
			now: NOW,
		});

		expect(resolved?.control.quantity).toBe(999);
		expect(resolved?.customerProduct).toBeUndefined();
	});
});
