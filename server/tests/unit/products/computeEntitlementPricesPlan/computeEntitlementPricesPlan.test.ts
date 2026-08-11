import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillingMethod,
	EntInterval,
	FeatureUsageType,
	ResetInterval,
} from "@autumn/shared";
import type { CreatePlanItemParamsV1 } from "@autumn/shared/api/products/items/crud/createPlanItemParamsV1";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import {
	computeEntitlementPricesPlan,
	type EntitlementPricesPlan,
} from "@/internal/products/actions/computeEntitlementPricesPlan";

const messagesFeature = features.create({
	id: "messages",
	internalId: "feat_internal_messages",
	name: "Messages",
	config: { usage_type: FeatureUsageType.Single },
});

const seatsFeature = features.create({
	id: "seats",
	internalId: "feat_internal_seats",
	name: "Seats",
	config: { usage_type: FeatureUsageType.Continuous },
});

const product = {
	...products.create({ id: "pro" }),
	env: AppEnv.Sandbox,
};

const ctx = contexts.create({
	features: [messagesFeature, seatsFeature],
	org: {
		id: "org_test",
		name: "Test Organization",
		slug: "test-org",
		default_currency: "usd",
		stripe_account_id: "acct_test",
		config: { multi_currency: false },
	} as never,
});

const freeMessagesItem = (
	overrides: Partial<CreatePlanItemParamsV1> = {},
): CreatePlanItemParamsV1 => ({
	feature_id: "messages",
	included: 100,
	reset: { interval: ResetInterval.Month },
	...overrides,
});

const pricedMessagesItem = (
	overrides: Partial<CreatePlanItemParamsV1> = {},
): CreatePlanItemParamsV1 => ({
	feature_id: "messages",
	included: 100,
	reset: { interval: ResetInterval.Month },
	price: {
		amount: 1,
		interval: BillingInterval.Month,
		billing_units: 1,
		billing_method: BillingMethod.UsageBased,
	},
	...overrides,
});

const basePrice = { amount: 50, interval: BillingInterval.Month };

const bucketCounts = (plan: EntitlementPricesPlan) => ({
	prices: {
		new: plan.prices.new.length,
		updated: plan.prices.updated.length,
		same: plan.prices.same.length,
		deleted: plan.prices.deleted.length,
		retired: plan.prices.retired.length,
	},
	entitlements: {
		new: plan.entitlements.new.length,
		updated: plan.entitlements.updated.length,
		same: plan.entitlements.same.length,
		deleted: plan.entitlements.deleted.length,
		retired: plan.entitlements.retired.length,
	},
});

describe("computeEntitlementPricesPlan", () => {
	test("1. create — no currentRows → all new", () => {
		const plan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				basePrice,
				planItems: [freeMessagesItem(), pricedMessagesItem({ feature_id: "seats", included: 2, reset: undefined })],
			},
		});

		expect(plan.prices.new.length).toBeGreaterThanOrEqual(2); // base + seats price
		expect(plan.entitlements.new.length).toBe(2);
		expect(plan.prices.same).toEqual([]);
		expect(plan.prices.deleted).toEqual([]);
		expect(plan.entitlements.same).toEqual([]);
	});

	test("2. update no-op — identical desired vs current → all same (ids kept)", () => {
		const currentEnt = entitlements.buildWithFeature({
			id: "ent_messages",
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			feature: messagesFeature,
			allowance: 100,
			interval: EntInterval.Month,
		});
		const currentPrice = prices.buildUsage({
			overrides: { id: "pr_messages", entitlement_id: "ent_messages" },
		});
		const currentBase = prices.buildFixed({
			overrides: { id: "pr_base" },
			configOverrides: { amount: 50 },
		});

		const plan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				basePrice,
				planItems: [pricedMessagesItem()],
				currentRows: {
					prices: [currentBase, currentPrice],
					entitlements: [currentEnt],
				},
			},
		});

		expect(bucketCounts(plan)).toEqual({
			prices: { new: 0, updated: 0, same: 2, deleted: 0, retired: 0 },
			entitlements: { new: 0, updated: 0, same: 1, deleted: 0, retired: 0 },
		});
		expect(plan.prices.same.map((price) => price.id).sort()).toEqual([
			"pr_base",
			"pr_messages",
		]);
		expect(plan.entitlements.same[0].id).toBe("ent_messages");
	});

	test("3a. update amount edit (no protect) → delete old + mint new", () => {
		const currentEnt = entitlements.buildWithFeature({
			id: "ent_messages",
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			feature: messagesFeature,
			allowance: 100,
			interval: EntInterval.Month,
		});
		const currentPrice = prices.buildUsage({
			overrides: { id: "pr_messages", entitlement_id: "ent_messages" },
			configOverrides: {
				usage_tiers: [{ to: "inf", amount: 1 }],
			},
		});

		const plan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				planItems: [
					pricedMessagesItem({
						price: {
							amount: 9,
							interval: BillingInterval.Month,
							billing_units: 1,
							billing_method: BillingMethod.UsageBased,
						},
					}),
				],
				currentRows: {
					prices: [currentPrice],
					entitlements: [currentEnt],
				},
			},
		});

		// Definition-only claim: amount differ → no claim → leave + new.
		expect(plan.prices.deleted.map((price) => price.id)).toEqual([
			"pr_messages",
		]);
		expect(plan.entitlements.deleted.map((ent) => ent.id)).toEqual([
			"ent_messages",
		]);
		expect(plan.prices.new).toHaveLength(1);
		expect(plan.entitlements.new).toHaveLength(1);
		expect(plan.prices.updated).toEqual([]);
	});

	test("3b. update amount edit (protect) → retired + new", () => {
		const currentEnt = entitlements.buildWithFeature({
			id: "ent_messages",
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			feature: messagesFeature,
			allowance: 100,
			interval: EntInterval.Month,
		});
		const currentPrice = prices.buildUsage({
			overrides: { id: "pr_messages", entitlement_id: "ent_messages" },
		});

		const plan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: true },
				product,
				planItems: [
					pricedMessagesItem({
						price: {
							amount: 9,
							interval: BillingInterval.Month,
							billing_units: 1,
							billing_method: BillingMethod.UsageBased,
						},
					}),
				],
				currentRows: {
					prices: [currentPrice],
					entitlements: [currentEnt],
				},
			},
		});

		expect(plan.prices.retired.map((price) => price.id)).toEqual([
			"pr_messages",
		]);
		expect(plan.entitlements.retired.map((ent) => ent.id)).toEqual([
			"ent_messages",
		]);
		expect(plan.prices.new).toHaveLength(1);
		expect(plan.entitlements.new).toHaveLength(1);
		expect(plan.prices.new[0].id).not.toBe("pr_messages");
	});

	test("4. update remove feature → deleted / retired", () => {
		const currentEnt = entitlements.buildWithFeature({
			id: "ent_messages",
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			feature: messagesFeature,
			allowance: 100,
			interval: EntInterval.Month,
		});

		const deletedPlan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				planItems: [],
				currentRows: {
					prices: [],
					entitlements: [currentEnt],
				},
			},
		});
		expect(deletedPlan.entitlements.deleted.map((ent) => ent.id)).toEqual([
			"ent_messages",
		]);

		const retiredPlan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: true },
				product,
				planItems: [],
				currentRows: {
					prices: [],
					entitlements: [currentEnt],
				},
			},
		});
		expect(retiredPlan.entitlements.retired.map((ent) => ent.id)).toEqual([
			"ent_messages",
		]);
	});

	test("5. update add feature → new", () => {
		const plan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				planItems: [freeMessagesItem()],
				currentRows: { prices: [], entitlements: [] },
			},
		});
		expect(plan.entitlements.new).toHaveLength(1);
		expect(plan.entitlements.new[0].feature_id).toBe("messages");
	});

	test("6. update free→paid same feature → leave free + mint paid", () => {
		const currentEnt = entitlements.buildWithFeature({
			id: "ent_messages",
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			feature: messagesFeature,
			allowance: 100,
			interval: EntInterval.Month,
		});

		const plan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				planItems: [pricedMessagesItem()],
				currentRows: {
					prices: [],
					entitlements: [currentEnt],
				},
			},
		});

		expect(plan.entitlements.deleted.map((ent) => ent.id)).toEqual([
			"ent_messages",
		]);
		expect(plan.entitlements.new).toHaveLength(1);
		expect(plan.prices.new).toHaveLength(1);
		expect(plan.entitlements.updated).toEqual([]);
	});

	test("7–8. update base amount / remove base", () => {
		const currentBase = prices.buildFixed({
			overrides: { id: "pr_base" },
			configOverrides: { amount: 50 },
		});

		const amountEdit = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				basePrice: { amount: 75, interval: BillingInterval.Month },
				planItems: [],
				currentRows: { prices: [currentBase], entitlements: [] },
			},
		});
		// Definition-only: amount differ → leave + new (same as EP lane).
		expect(amountEdit.prices.deleted.map((price) => price.id)).toEqual([
			"pr_base",
		]);
		expect(amountEdit.prices.new).toHaveLength(1);
		expect(amountEdit.prices.updated).toEqual([]);

		const removeBase = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				planItems: [],
				currentRows: { prices: [currentBase], entitlements: [] },
			},
		});
		expect(removeBase.prices.deleted.map((price) => price.id)).toEqual([
			"pr_base",
		]);
	});

	test("9. version — identical content → all new; current ignored", () => {
		const currentEnt = entitlements.buildWithFeature({
			id: "ent_messages",
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			feature: messagesFeature,
			allowance: 100,
			interval: EntInterval.Month,
		});
		const currentPrice = prices.buildUsage({
			overrides: { id: "pr_messages", entitlement_id: "ent_messages" },
		});

		const plan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "version" },
				product,
				planItems: [pricedMessagesItem()],
				currentRows: {
					prices: [currentPrice],
					entitlements: [currentEnt],
				},
			},
		});

		expect(plan.prices.new).toHaveLength(1);
		expect(plan.entitlements.new).toHaveLength(1);
		expect(plan.prices.new[0].id).not.toBe("pr_messages");
		expect(plan.prices.deleted).toEqual([]);
		expect(plan.prices.retired).toEqual([]);
		expect(plan.entitlements.same).toEqual([]);
	});

	test("10–11. custom exact reuses catalog; custom changed mints is_custom", () => {
		const currentEnt = entitlements.buildWithFeature({
			id: "ent_messages",
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			feature: messagesFeature,
			allowance: 100,
			interval: EntInterval.Month,
		});
		const currentPrice = prices.buildUsage({
			overrides: { id: "pr_messages", entitlement_id: "ent_messages" },
		});

		const exact = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "custom" },
				product,
				planItems: [pricedMessagesItem()],
				currentRows: {
					prices: [currentPrice],
					entitlements: [currentEnt],
				},
			},
		});
		expect(exact.prices.same.map((price) => price.id)).toEqual(["pr_messages"]);
		expect(exact.entitlements.same.map((ent) => ent.id)).toEqual([
			"ent_messages",
		]);
		expect(exact.prices.deleted).toEqual([]);

		const changed = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "custom" },
				product,
				planItems: [
					pricedMessagesItem({
						price: {
							amount: 9,
							interval: BillingInterval.Month,
							billing_units: 1,
							billing_method: BillingMethod.UsageBased,
						},
					}),
				],
				currentRows: {
					prices: [currentPrice],
					entitlements: [currentEnt],
				},
			},
		});
		expect(changed.prices.new).toHaveLength(1);
		expect(changed.prices.new[0].is_custom).toBe(true);
		expect(changed.entitlements.new[0].is_custom).toBe(true);
		expect(changed.prices.deleted).toEqual([]);
		expect(changed.prices.retired).toEqual([]);
	});

	test("projected keeps same ids on no-op", () => {
		const currentEnt = entitlements.buildWithFeature({
			id: "ent_messages",
			internal_feature_id: messagesFeature.internal_id,
			feature_id: messagesFeature.id,
			feature: messagesFeature,
			allowance: 100,
			interval: EntInterval.Month,
		});
		const currentPrice = prices.buildUsage({
			overrides: { id: "pr_messages", entitlement_id: "ent_messages" },
		});
		const currentBase = prices.buildFixed({
			overrides: { id: "pr_base" },
			configOverrides: { amount: 50 },
		});

		const plan = computeEntitlementPricesPlan({
			ctx,
			params: {
				mode: { type: "update", protectReferencedRows: false },
				product,
				basePrice,
				planItems: [pricedMessagesItem()],
				currentRows: {
					prices: [currentBase, currentPrice],
					entitlements: [currentEnt],
				},
			},
		});

		expect(plan.projected.prices.map((price) => price.id).sort()).toEqual([
			"pr_base",
			"pr_messages",
		]);
		expect(plan.projected.entitlements.map((ent) => ent.id)).toEqual([
			"ent_messages",
		]);
	});
});


