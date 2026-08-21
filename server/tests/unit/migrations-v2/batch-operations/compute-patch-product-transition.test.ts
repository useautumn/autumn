/**
 * computePatchProductTransition is a customize lowerer, not a product diff.
 * Catalog products are identity (repoint) only; item ops come from
 * removeItems + minted addEntitlementPrices.
 *
 * Contract:
 *   1. In-place customize: catalog ents ignored; sparse month filter + minted 30 → one replace
 *   2. Remove only → removed filter
 *   3. Add only → added minted row
 *   4. Two features → independent ops
 *   5. Mismatched interval → remove + add, not replace
 *   6. Distinct from/to ids + replace → customerProduct repoint
 *   7. Same internal_id → customerProduct undefined
 *   8. Sibling cadence → replace the monthly filter only
 */

import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type EntitlementPrice,
	type EntitlementWithFeature,
	type Feature,
	FeatureType,
	type FullProductWithoutLicenses,
	ResetInterval,
} from "@autumn/shared";
import { computePatchProductOperations } from "@/internal/migrations/v2/batchOperations/compute/operations/computePatchProductOperations.js";
import { computePatchProductTransition } from "@/internal/migrations/v2/batchOperations/compute/transitions/computePatchProductTransition.js";

const messagesFeature = {
	internal_id: "feat_messages",
	id: "messages",
	type: FeatureType.Metered,
} as unknown as Feature;

const dashboardFeature = {
	internal_id: "feat_dashboard",
	id: "dashboard",
	type: FeatureType.Boolean,
} as unknown as Feature;

const messagesEnt = ({
	id = "ent_messages",
	interval = EntInterval.Month,
	intervalCount = 1,
	allowance = 100,
}: {
	id?: string;
	interval?: EntInterval | null;
	intervalCount?: number;
	allowance?: number;
} = {}): EntitlementWithFeature =>
	({
		id,
		created_at: 0,
		internal_product_id: "prod_pro",
		internal_feature_id: messagesFeature.internal_id,
		feature_id: messagesFeature.id,
		allowance_type: AllowanceType.Fixed,
		allowance,
		interval,
		interval_count: intervalCount,
		feature: messagesFeature,
	}) as unknown as EntitlementWithFeature;

const dashboardEnt = ({
	id = "ent_dashboard",
}: {
	id?: string;
} = {}): EntitlementWithFeature =>
	({
		id,
		created_at: 0,
		internal_product_id: "prod_pro",
		internal_feature_id: dashboardFeature.internal_id,
		feature_id: dashboardFeature.id,
		allowance_type: null,
		allowance: null,
		interval: null,
		feature: dashboardFeature,
	}) as unknown as EntitlementWithFeature;

const catalogProduct = ({
	internalId,
	entitlements = [],
}: {
	internalId: string;
	entitlements?: EntitlementWithFeature[];
}): FullProductWithoutLicenses =>
	({
		id: "pro",
		internal_id: internalId,
		entitlements,
		prices: [],
	}) as unknown as FullProductWithoutLicenses;

const asEntitlementPrice = (
	entitlement: EntitlementWithFeature,
): EntitlementPrice => ({ entitlement }) satisfies EntitlementPrice;

const monthMessagesFilter = {
	feature_id: "messages",
	interval: ResetInterval.Month,
};

const compiledMonthMessagesFilter = {
	feature_id: "messages",
	interval: EntInterval.Month,
	interval_count: 1,
};

describe("computePatchProductTransition", () => {
	test("in-place customize ignores catalog entitlements and pairs as one replace", () => {
		const alreadyRewritten = messagesEnt({
			id: "ent_catalog_rewritten",
			allowance: 30,
		});
		const minted = messagesEnt({ id: "ent_messages_new", allowance: 30 });
		const product = catalogProduct({
			internalId: "prod_pro",
			entitlements: [alreadyRewritten],
		});

		const result = computePatchProductTransition({
			fromProduct: product,
			toProduct: product,
			removeItems: [monthMessagesFilter],
			addEntitlementPrices: [asEntitlementPrice(minted)],
		});

		expect(result.replaced).toHaveLength(1);
		expect(result.replaced[0]?.from).toEqual(compiledMonthMessagesFilter);
		expect(result.replaced[0]?.to.entitlement.id).toBe("ent_messages_new");
		expect(result.replaced[0]?.to.entitlement.allowance).toBe(30);
		expect(result.added).toHaveLength(0);
		expect(result.removed).toHaveLength(0);
		expect(result.customerProduct).toBeUndefined();
	});

	test("remove only yields a removed filter", () => {
		const result = computePatchProductTransition({
			removeItems: [monthMessagesFilter],
			addEntitlementPrices: [],
		});

		expect(result.removed).toEqual([{ filter: compiledMonthMessagesFilter }]);
		expect(result.replaced).toHaveLength(0);
		expect(result.added).toHaveLength(0);
	});

	test("add only yields the minted row", () => {
		const minted = messagesEnt({ id: "ent_messages_new", allowance: 30 });

		const result = computePatchProductTransition({
			addEntitlementPrices: [asEntitlementPrice(minted)],
		});

		expect(result.added).toHaveLength(1);
		expect(result.added[0]?.entitlement.id).toBe("ent_messages_new");
		expect(result.replaced).toHaveLength(0);
		expect(result.removed).toHaveLength(0);
	});

	test("two features lower independently", () => {
		const mintedMessages = messagesEnt({
			id: "ent_messages_new",
			allowance: 30,
		});
		const mintedDashboard = dashboardEnt({ id: "ent_dashboard_new" });

		const result = computePatchProductTransition({
			removeItems: [monthMessagesFilter],
			addEntitlementPrices: [
				asEntitlementPrice(mintedMessages),
				asEntitlementPrice(mintedDashboard),
			],
		});

		expect(result.replaced).toHaveLength(1);
		expect(result.replaced[0]?.from).toEqual(compiledMonthMessagesFilter);
		expect(result.replaced[0]?.to.entitlement.id).toBe("ent_messages_new");
		expect(result.added.map((price) => price.entitlement.id)).toEqual([
			"ent_dashboard_new",
		]);
		expect(result.removed).toHaveLength(0);
	});

	test("mismatched interval is remove plus add, not a replace", () => {
		const mintedQuarterly = messagesEnt({
			id: "ent_quarterly_new",
			interval: EntInterval.Month,
			intervalCount: 3,
			allowance: 90,
		});
		const monthlyFilter = {
			feature_id: "messages",
			interval: ResetInterval.Month,
			interval_count: 1,
		};

		const result = computePatchProductTransition({
			removeItems: [monthlyFilter],
			addEntitlementPrices: [asEntitlementPrice(mintedQuarterly)],
		});

		expect(result.removed).toEqual([{ filter: compiledMonthMessagesFilter }]);
		expect(result.added).toHaveLength(1);
		expect(result.added[0]?.entitlement.id).toBe("ent_quarterly_new");
		expect(result.replaced).toHaveLength(0);
	});

	test("customize and version returns a replace and a customer-product repoint", () => {
		const minted = messagesEnt({ id: "ent_messages_new", allowance: 30 });
		const fromProduct = catalogProduct({
			internalId: "prod_pro_v1",
			entitlements: [messagesEnt({ allowance: 100 })],
		});
		const toProduct = catalogProduct({
			internalId: "prod_pro_v2",
			entitlements: [minted],
		});

		const result = computePatchProductTransition({
			fromProduct,
			toProduct,
			removeItems: [monthMessagesFilter],
			addEntitlementPrices: [asEntitlementPrice(minted)],
		});

		expect(result.replaced).toHaveLength(1);
		expect(result.replaced[0]?.from).toEqual(compiledMonthMessagesFilter);
		expect(result.replaced[0]?.to.entitlement.id).toBe("ent_messages_new");
		expect(result.added).toHaveLength(0);
		expect(result.removed).toHaveLength(0);
		expect(result.customerProduct).toEqual({
			fromInternalProductId: "prod_pro_v1",
			toInternalProductId: "prod_pro_v2",
		});
	});

	test("same internal_id leaves customerProduct undefined", () => {
		const minted = messagesEnt({ id: "ent_messages_new", allowance: 30 });
		const product = catalogProduct({ internalId: "prod_pro" });

		const result = computePatchProductTransition({
			fromProduct: product,
			toProduct: product,
			removeItems: [monthMessagesFilter],
			addEntitlementPrices: [asEntitlementPrice(minted)],
		});

		expect(result.customerProduct).toBeUndefined();
		expect(result.replaced).toHaveLength(1);
	});

	test("sibling cadence replaces only the matched monthly filter", () => {
		const monthly = messagesEnt({ id: "ent_monthly" });
		const quarterly = messagesEnt({ id: "ent_quarterly", intervalCount: 3 });
		const mintedMonthly = messagesEnt({
			id: "ent_monthly_new",
			allowance: 200,
		});
		const monthlyFilter = {
			feature_id: "messages",
			interval: ResetInterval.Month,
			interval_count: 1,
		};

		const result = computePatchProductTransition({
			fromProduct: catalogProduct({
				internalId: "prod_pro",
				entitlements: [monthly, quarterly],
			}),
			toProduct: catalogProduct({
				internalId: "prod_pro",
				entitlements: [monthly, quarterly],
			}),
			removeItems: [monthlyFilter],
			addEntitlementPrices: [asEntitlementPrice(mintedMonthly)],
		});

		expect(result.replaced).toHaveLength(1);
		expect(result.replaced[0]?.from).toEqual(compiledMonthMessagesFilter);
		expect(result.replaced[0]?.to.entitlement.id).toBe("ent_monthly_new");
		expect(result.added).toHaveLength(0);
		expect(result.removed).toHaveLength(0);
	});

	test("lowering the transition emits filter replace ops", () => {
		const minted = messagesEnt({ id: "ent_messages_new", allowance: 30 });
		const patchTransition = computePatchProductTransition({
			removeItems: [monthMessagesFilter],
			addEntitlementPrices: [asEntitlementPrice(minted)],
		});
		const operations = computePatchProductOperations({
			patchTransition,
			licenseLinks: [],
		});

		expect(operations.replaceEntitlements).toEqual([
			expect.objectContaining({
				by: "filter",
				from: compiledMonthMessagesFilter,
			}),
		]);
		expect(
			operations.replaceEntitlements[0]?.entitlementPrice.entitlement.id,
		).toBe("ent_messages_new");
	});
});
