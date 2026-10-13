import { describe, expect, test } from "bun:test";
import {
	type FullCusEntWithFullCusProduct,
	type Price,
	TierBehavior,
	type UsageTier,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import { allocatedToStripeItemSpec } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/cusPriceToStripeItemSpec/allocatedToStripeItemSpec";

const TIERS = [
	{ to: 5, amount: 10 },
	{ to: "inf", amount: 6 },
] as UsageTier[];

const seatQuantity = ({
	tierBehavior,
	seats,
	included = 3,
}: {
	tierBehavior: TierBehavior | null;
	seats: number;
	included?: number;
}) => {
	const customerEntitlement = customerEntitlements.create({
		entitlementId: "ent_seats",
		featureId: "seats",
		featureName: "Seats",
		allowance: included,
		balance: included - seats,
	});
	const base = prices.createAllocated({
		id: "price_seats",
		featureId: "seats",
		stripePriceId: "price_stripe_seats",
		entitlementId: "ent_seats",
	});
	const price = {
		...base,
		tier_behavior: tierBehavior,
		config: { ...base.config, usage_tiers: TIERS },
	} as Price;
	const product = products.createFull({
		id: "pro",
		name: "Pro",
		prices: [price],
		entitlements: [customerEntitlement.entitlement],
	});
	const cusEnt: FullCusEntWithFullCusProduct = {
		...customerEntitlement,
		customer_product: customerProducts.create({
			productId: product.id,
			product,
			customerEntitlements: [customerEntitlement],
			customerPrices: [prices.createCustomer({ price })],
		}),
	};

	return allocatedToStripeItemSpec({
		cusEntWithCusProduct: cusEnt,
		currency: "usd",
		orgDefault: "usd",
	})?.quantity;
};

describe("allocatedToStripeItemSpec quantity", () => {
	test("volume bills only the seats over included", () => {
		expect(
			seatQuantity({ tierBehavior: TierBehavior.VolumeBased, seats: 9 }),
		).toBe(6);
	});

	test("volume within included sends 0", () => {
		expect(
			seatQuantity({ tierBehavior: TierBehavior.VolumeBased, seats: 2 }),
		).toBe(0);
	});

	test("graduated keeps total seats, priced over a free included tier", () => {
		expect(seatQuantity({ tierBehavior: null, seats: 9 })).toBe(9);
	});
});
