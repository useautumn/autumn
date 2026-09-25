import { test } from "bun:test";
import { RewardType } from "@autumn/shared";
import {
	applyCustomerCoupon,
	applySubscriptionDiscount,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { createReward } from "@tests/utils/productUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts";

/**
 * Customers whose attach sheet shows existing discounts that can be removed.
 *
 *   seed-disc-upgrade         on Pro with LAUNCH30 + LOYALTY10 → attach Premium
 *   seed-disc-addon           on Pro with LAUNCH30             → attach the add-on
 *   seed-disc-customer-level  no plan, customer-level PARTNER15 → attach Pro
 *   seed-disc-none            on Pro, no discounts             → attach Premium (control)
 */
const PLAN_GROUP = "disc-remove";

const CUSTOMERS = {
	upgrade: "seed-disc-upgrade",
	addOn: "seed-disc-addon",
	customerLevel: "seed-disc-customer-level",
	none: "seed-disc-none",
} as const;

const pro = products.base({
	id: "pro",
	group: PLAN_GROUP,
	items: [
		items.monthlyMessages({ includedUsage: 500 }),
		items.monthlyPrice({ price: 20 }),
	],
});

const premium = products.base({
	id: "premium",
	group: PLAN_GROUP,
	items: [
		items.monthlyMessages({ includedUsage: 1000 }),
		items.monthlyPrice({ price: 50 }),
	],
});

const addOn = products.recurringAddOn({
	id: "addon",
	items: [items.monthlyWords({ includedUsage: 100 })],
});

const launch = constructCoupon({
	id: "disc-launch-30",
	promoCode: "LAUNCH30",
	discountType: RewardType.PercentageDiscount,
	discountValue: 30,
});

const loyalty = constructCoupon({
	id: "disc-loyalty-10",
	promoCode: "LOYALTY10",
	discountType: RewardType.PercentageDiscount,
	discountValue: 10,
});

const partner = constructCoupon({
	id: "disc-partner-15",
	promoCode: "PARTNER15",
	discountType: RewardType.FixedDiscount,
	discountValue: 15,
});

const applyToSubscription = async ({
	customerId,
	couponIds,
}: {
	customerId: string;
	couponIds: string[];
}) => {
	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds,
	});
};

const applyToCustomer = async ({
	customerId,
	couponId,
}: {
	customerId: string;
	couponId: string;
}) => {
	const customer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = customer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`${customerId} has no Stripe customer`);
	}
	await applyCustomerCoupon({ stripeCustomerId, couponId });
};

test(
	`${chalk.yellowBright("scenario: attach sheet with removable discounts")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({
			customerId: CUSTOMERS.upgrade,
			setup: [
				...Object.values(CUSTOMERS).map((customerId) =>
					s.deleteCustomer({ customerId }),
				),
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.otherCustomers([
					{ id: CUSTOMERS.addOn, paymentMethod: "success" },
					{ id: CUSTOMERS.customerLevel, paymentMethod: "success" },
					{ id: CUSTOMERS.none, paymentMethod: "success" },
				]),
				s.products({ list: [pro, premium, addOn], prefix: "disc" }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: pro.id, customerId: CUSTOMERS.addOn }),
				s.billing.attach({ productId: pro.id, customerId: CUSTOMERS.none }),
			],
		});

		for (const reward of [launch, loyalty, partner]) {
			await createReward({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				autumn: autumnV2_3,
				reward,
			});
		}

		await applyToSubscription({
			customerId: CUSTOMERS.upgrade,
			couponIds: [launch.id, loyalty.id],
		});
		await applyToSubscription({
			customerId: CUSTOMERS.addOn,
			couponIds: [launch.id],
		});
		await applyToCustomer({
			customerId: CUSTOMERS.customerLevel,
			couponId: partner.id,
		});
	},
	{ timeout: 300_000 },
);
