import { describe, expect, test } from "bun:test";
import {
	type FullCusEntWithFullCusProduct,
	type FullCustomerPrice,
	OnDecrease,
	type Price,
	TierBehavior,
	type UsageTier,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleProratedDowngrade } from "@/internal/balances/utils/paidAllocatedFeature/createPaidAllocatedInvoice/handleProratedDowngrade.js";
import { handleProratedUpgrade } from "@/internal/balances/utils/paidAllocatedFeature/createPaidAllocatedInvoice/handleProratedUpgrade.js";

const INCLUDED = 3;
const TIERS = [
	{ to: 10, amount: 10 },
	{ to: "inf", amount: 8 },
] as UsageTier[];

const seatSetup = ({ tierBehavior }: { tierBehavior?: TierBehavior }) => {
	const customerEntitlement = customerEntitlements.create({
		entitlementId: "ent_users",
		featureId: "users",
		featureName: "Users",
		allowance: INCLUDED,
		balance: INCLUDED - 4,
	});
	const base = prices.createAllocated({
		id: "price_users",
		featureId: "users",
		entitlementId: "ent_users",
	});
	const price = {
		...base,
		tier_behavior: tierBehavior,
		config: { ...base.config, usage_tiers: TIERS, billing_units: 1 },
		proration_config: { on_decrease: OnDecrease.NoProrations },
	} as Price;
	const product = products.createFull({
		id: "pro",
		name: "Pro",
		prices: [price],
		entitlements: [customerEntitlement.entitlement],
	});
	const cusPrice = prices.createCustomer({ price }) as FullCustomerPrice;
	const customerProduct = customerProducts.create({
		productId: product.id,
		product,
		customerEntitlements: [customerEntitlement],
		customerPrices: [cusPrice],
	});
	const cusEnt: FullCusEntWithFullCusProduct = {
		...customerEntitlement,
		customer_product: customerProduct,
	};

	const quantities: number[] = [];
	const stripeCli = {
		subscriptionItems: {
			update: async (_id: string, params: { quantity: number }) => {
				quantities.push(params.quantity);
				return {};
			},
		},
	} as unknown as Stripe;
	const ctx = {
		logger: { info: () => {}, warn: () => {}, error: () => {} },
	} as unknown as AutumnContext;
	const sub = { id: "sub_1", status: "trialing" } as Stripe.Subscription;
	const subItem = { id: "si_1" } as Stripe.SubscriptionItem;

	return { cusEnt, cusPrice, stripeCli, ctx, sub, subItem, quantities };
};

describe("allocated seat Stripe quantity", () => {
	test("volume: 3 included, 4 in use, add a seat → Stripe quantity 2", async () => {
		const setup = seatSetup({ tierBehavior: TierBehavior.VolumeBased });
		await handleProratedUpgrade({
			...setup,
			prevBalance: INCLUDED - 4,
			newBalance: INCLUDED - 5,
		});
		expect(setup.quantities).toEqual([2]);
	});

	test("volume: 4 in use, remove a seat down to included → Stripe quantity 0", async () => {
		const setup = seatSetup({ tierBehavior: TierBehavior.VolumeBased });
		await handleProratedDowngrade({
			...setup,
			prevBalance: INCLUDED - 4,
			newBalance: 0,
		});
		expect(setup.quantities).toEqual([0]);
	});

	test("graduated keeps sending total seats: add a seat → 5", async () => {
		const setup = seatSetup({});
		await handleProratedUpgrade({
			...setup,
			prevBalance: INCLUDED - 4,
			newBalance: INCLUDED - 5,
		});
		expect(setup.quantities).toEqual([5]);
	});
});
