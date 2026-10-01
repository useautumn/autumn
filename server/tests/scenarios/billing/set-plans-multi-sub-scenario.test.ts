/** Customers for hand QA of free-plan seeding in Sync and Set Plans, single and multi subscription. */

import { test } from "bun:test";
import { createStripeSubscriptionFromProduct } from "@tests/integration/billing/sync/utils/syncTestUtils";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

const qaProducts = () => ({
	free: products.base({
		id: "free",
		isDefault: true,
		group: "main",
		items: [items.monthlyMessages({ includedUsage: 10 })],
	}),
	pro: products.pro({
		group: "main",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	}),
	bonus: products.base({
		id: "bonus",
		isAddOn: true,
		items: [items.monthlyWords({ includedUsage: 25 })],
	}),
	seats: products.recurringAddOn({
		id: "seats",
		items: [items.monthlyUsers({ includedUsage: 5 })],
	}),
	annualSupport: products.base({
		id: "annual-support",
		isAddOn: true,
		items: [items.annualPrice({ price: 240 }), items.monthlyCredits()],
	}),
});

test.concurrent(
	"QA 1: one subscription (Pro) plus a free add-on — both sheets show the free add-on",
	async () => {
		const { free, pro, bonus } = qaProducts();
		await initScenario({
			customerId: "qa-free-single-sub",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, bonus] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: bonus.id }),
				s.track({ featureId: TestFeature.Words, value: 7, timeout: 2000 }),
			],
		});
	},
);

test.concurrent(
	"QA 2: first import — free main + free add-on, Pro created straight in Stripe",
	async () => {
		const { free, pro, bonus } = qaProducts();
		const { ctx, customerId } = await initScenario({
			customerId: "qa-free-first-import",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, bonus] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.billing.attach({ productId: bonus.id }),
			],
		});

		await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
	},
);

test.concurrent(
	"QA 3: two subscriptions (Pro monthly, annual support) plus a free add-on",
	async () => {
		const { free, pro, bonus, annualSupport } = qaProducts();
		await initScenario({
			customerId: "qa-multi-sub-intervals",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, bonus, annualSupport] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: annualSupport.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: bonus.id }),
			],
		});
	},
);

test.concurrent(
	"QA 4: two subscriptions across entities — Pro customer-level, seats on ent-1, free add-on on ent-2",
	async () => {
		const { free, pro, bonus, seats } = qaProducts();
		await initScenario({
			customerId: "qa-multi-sub-entities",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, bonus, seats] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: seats.id,
					entityIndex: 0,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: bonus.id, entityIndex: 1 }),
			],
		});
	},
);

test.concurrent(
	"QA 5: Pro subscription past due, annual support subscription active, free add-on",
	async () => {
		const { free, pro, bonus, annualSupport } = qaProducts();
		const { ctx, customerId, testClockId } = await initScenario({
			customerId: "qa-multi-sub-past-due",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, bonus, annualSupport] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: annualSupport.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: bonus.id }),
			],
		});

		await driveProductPastDue({
			ctx,
			testClockId: testClockId!,
			customerId,
			productId: pro.id,
		});
	},
);

test.concurrent(
	"QA 6: Pro with a scheduled downgrade to Free, second subscription with seats, free add-on",
	async () => {
		const { free, pro, bonus, seats } = qaProducts();
		await initScenario({
			customerId: "qa-multi-sub-scheduled",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, bonus, seats] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({
					productId: seats.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: bonus.id }),
				s.billing.attach({ productId: free.id }),
			],
		});
	},
);

test.concurrent(
	"QA 7: linked Pro subscription plus an unlinked Stripe subscription for seats",
	async () => {
		const { free, pro, bonus, seats } = qaProducts();
		const { ctx, customerId } = await initScenario({
			customerId: "qa-multi-sub-unlinked",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, bonus, seats] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: bonus.id }),
			],
		});

		await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: seats.id,
		});
	},
);
