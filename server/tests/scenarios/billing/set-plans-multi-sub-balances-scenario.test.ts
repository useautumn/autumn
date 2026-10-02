/** Customers with several subscriptions and real usage, for hand QA of the Set Plans balance changes. */

import { test } from "bun:test";
import { RolloverExpiryDurationType } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

const TRACK_TIMEOUT_MS = 2000;

const balanceProducts = () => ({
	pro: products.pro({
		group: "main",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	}),
	premium: {
		...products.premium({
			items: [
				items.monthlyMessages({ includedUsage: 500 }),
				items.monthlyWords({ includedUsage: 100 }),
			],
		}),
		group: "main",
	},
	growth: {
		...products.growth({
			items: [
				items.monthlyMessages({ includedUsage: 300 }),
				items.monthlyCredits({ includedUsage: 500 }),
			],
		}),
		group: "main",
	},
	bonus: products.base({
		id: "bonus",
		isAddOn: true,
		items: [items.monthlyWords({ includedUsage: 25 })],
	}),
	annualSupport: products.base({
		id: "annual-support",
		isAddOn: true,
		items: [
			items.annualPrice({ price: 240 }),
			items.monthlyCredits({ includedUsage: 1000 }),
		],
	}),
	seats: products.recurringAddOn({
		id: "seats",
		items: [items.monthlyWords({ includedUsage: 200 })],
	}),
});

const catalog = (plans: ReturnType<typeof balanceProducts>) =>
	s.products({ list: Object.values(plans) });

test.concurrent(
	"QA B1: usage on both subscriptions and the free add-on",
	async () => {
		const plans = balanceProducts();
		await initScenario({
			customerId: "qa-bal-usage",
			setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
			actions: [
				s.billing.attach({ productId: plans.pro.id }),
				s.billing.attach({
					productId: plans.annualSupport.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: plans.bonus.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 60,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: 10,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 40,
					timeout: TRACK_TIMEOUT_MS,
				}),
			],
		});
	},
);

test.concurrent(
	"QA B2: prepaid quantities on both subscriptions, partly used",
	async () => {
		const plans = balanceProducts();
		const prepaidPro = products.pro({
			id: "pro-prepaid",
			group: "main",
			items: [items.prepaidMessages({ billingUnits: 100, price: 10 })],
		});
		const prepaidSeats = products.recurringAddOn({
			id: "seats-prepaid",
			items: [items.prepaidUsers({ billingUnits: 1 })],
		});
		await initScenario({
			customerId: "qa-bal-prepaid",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [...Object.values(plans), prepaidPro, prepaidSeats],
				}),
			],
			actions: [
				s.billing.attach({
					productId: prepaidPro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
				s.billing.attach({
					productId: prepaidSeats.id,
					newBillingSubscription: true,
					options: [{ feature_id: TestFeature.Users, quantity: 5 }],
				}),
				s.billing.attach({ productId: plans.bonus.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 120,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Users,
					value: 3,
					timeout: TRACK_TIMEOUT_MS,
				}),
			],
		});
	},
);

test.concurrent(
	"QA B3: entity balances split across two subscriptions",
	async () => {
		const plans = balanceProducts();
		await initScenario({
			customerId: "qa-bal-entities",
			setup: [
				s.customer({ paymentMethod: "success" }),
				catalog(plans),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: plans.pro.id }),
				s.billing.attach({
					productId: plans.seats.id,
					entityIndex: 0,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: plans.seats.id, entityIndex: 1 }),
				s.billing.attach({ productId: plans.bonus.id, entityIndex: 2 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 45,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: 150,
					entityIndex: 0,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: 30,
					entityIndex: 1,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: 20,
					entityIndex: 2,
					timeout: TRACK_TIMEOUT_MS,
				}),
			],
		});
	},
);

test.concurrent(
	"QA B4: rollover carried into a second cycle, annual add-on on its own subscription",
	async () => {
		const plans = balanceProducts();
		const rolloverPro = products.pro({
			id: "pro-rollover",
			group: "main",
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: 100,
					rolloverConfig: {
						max_percentage: 50,
						length: 1,
						duration: RolloverExpiryDurationType.Month,
					},
				}),
			],
		});
		await initScenario({
			customerId: "qa-bal-rollover",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [...Object.values(plans), rolloverPro] }),
			],
			actions: [
				s.billing.attach({ productId: rolloverPro.id }),
				s.billing.attach({
					productId: plans.annualSupport.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: plans.bonus.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 30,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.advanceToNextInvoice(),
				s.track({
					featureId: TestFeature.Messages,
					value: 20,
					timeout: TRACK_TIMEOUT_MS,
				}),
			],
		});
	},
);

test.concurrent(
	"QA B5: usage-based overage on one subscription, credits used on the other",
	async () => {
		const plans = balanceProducts();
		const overagePro = products.pro({
			id: "pro-overage",
			group: "main",
			items: [items.consumableMessages({ includedUsage: 100, price: 0.1 })],
		});
		await initScenario({
			customerId: "qa-bal-overage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [...Object.values(plans), overagePro] }),
			],
			actions: [
				s.billing.attach({ productId: overagePro.id }),
				s.billing.attach({
					productId: plans.annualSupport.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: plans.bonus.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 160,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 250,
					timeout: TRACK_TIMEOUT_MS,
				}),
			],
		});
	},
);

test.concurrent(
	"QA B6: past-due subscription with usage, annual add-on active",
	async () => {
		const plans = balanceProducts();
		const { ctx, customerId, testClockId } = await initScenario({
			customerId: "qa-bal-past-due",
			setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
			actions: [
				s.billing.attach({ productId: plans.pro.id }),
				s.billing.attach({
					productId: plans.annualSupport.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: plans.bonus.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 70,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 100,
					timeout: TRACK_TIMEOUT_MS,
				}),
			],
		});

		await driveProductPastDue({
			ctx,
			testClockId: testClockId!,
			customerId,
			productId: plans.pro.id,
		});
	},
);

test.concurrent(
	"QA B7: Premium downgrading to Pro with usage over Pro's allowance, seats on a second subscription",
	async () => {
		const plans = balanceProducts();
		await initScenario({
			customerId: "qa-bal-downgrade",
			setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
			actions: [
				s.billing.attach({ productId: plans.premium.id }),
				s.billing.attach({
					productId: plans.seats.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: plans.bonus.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 180,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: 90,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.billing.attach({ productId: plans.pro.id }),
			],
		});
	},
);

test.concurrent(
	"QA B8: growth plan with credits and messages, seats and annual support on two more subscriptions",
	async () => {
		const plans = balanceProducts();
		await initScenario({
			customerId: "qa-bal-three-subs",
			setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
			actions: [
				s.billing.attach({ productId: plans.growth.id }),
				s.billing.attach({
					productId: plans.seats.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({
					productId: plans.annualSupport.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: plans.bonus.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 210,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 300,
					timeout: TRACK_TIMEOUT_MS,
				}),
				s.track({
					featureId: TestFeature.Words,
					value: 120,
					timeout: TRACK_TIMEOUT_MS,
				}),
			],
		});
	},
);
