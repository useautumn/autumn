/**
 * Allocated volume prices have no per-copy Stripe price, so two copies of one plan
 * (e.g. on two entities) would add their seats into one item and share a tier.
 */

import { describe, expect, test } from "bun:test";
import {
	type FullCusProduct,
	type Price,
	TierBehavior,
	type UsageTier,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { handleSharedVolumeSeatPriceErrors } from "@/internal/billing/v2/providers/stripe/errors/handleSharedVolumeSeatPriceErrors";

const TIERS = [
	{ to: 10, amount: 10 },
	{ to: "inf", amount: 8 },
] as UsageTier[];

const seatPlanCopy = ({
	tierBehavior,
	entityId,
}: {
	tierBehavior?: TierBehavior;
	entityId: string;
}): FullCusProduct => {
	const customerEntitlement = customerEntitlements.create({
		entitlementId: "ent_users",
		featureId: "users",
		featureName: "Users",
		allowance: 0,
		balance: -6,
	});
	const base = prices.createAllocated({
		id: "price_users",
		featureId: "users",
		entitlementId: "ent_users",
	});
	const price = {
		...base,
		tier_behavior: tierBehavior,
		config: { ...base.config, usage_tiers: TIERS },
	} as Price;
	const product = products.createFull({
		id: "seats",
		name: "Seats",
		prices: [price],
		entitlements: [customerEntitlement.entitlement],
	});
	return {
		...customerProducts.create({
			productId: product.id,
			product,
			customerEntitlements: [customerEntitlement],
			customerPrices: [prices.createCustomer({ price })],
		}),
		internal_entity_id: entityId,
	} as FullCusProduct;
};

describe("shared volume seat price errors", () => {
	test("rejects two copies of an allocated volume plan", () => {
		expect(() =>
			handleSharedVolumeSeatPriceErrors({
				customerProducts: [
					seatPlanCopy({
						tierBehavior: TierBehavior.VolumeBased,
						entityId: "ent_a",
					}),
					seatPlanCopy({
						tierBehavior: TierBehavior.VolumeBased,
						entityId: "ent_b",
					}),
				],
			}),
		).toThrow("can't be attached to more than one entity yet");
	});

	test("accepts a single copy of an allocated volume plan", () => {
		expect(() =>
			handleSharedVolumeSeatPriceErrors({
				customerProducts: [
					seatPlanCopy({
						tierBehavior: TierBehavior.VolumeBased,
						entityId: "ent_a",
					}),
				],
			}),
		).not.toThrow();
	});

	test("leaves graduated seat plans as they are on dev", () => {
		expect(() =>
			handleSharedVolumeSeatPriceErrors({
				customerProducts: [
					seatPlanCopy({ entityId: "ent_a" }),
					seatPlanCopy({ entityId: "ent_b" }),
				],
			}),
		).not.toThrow();
	});
});
