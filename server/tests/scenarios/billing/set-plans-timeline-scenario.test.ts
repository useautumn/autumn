/** Customers in each state the set_plans timeline diff classifies, for hand QA of the Set Plans review. */

import { test } from "bun:test";
import { ms } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

const TRACK_TIMEOUT_MS = 2000;
const NEXT_PHASE_DAYS = 30;
const LATER_PHASE_DAYS = 60;

const timelineProducts = () => ({
	pro: products.pro({
		group: "main",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	}),
	premium: {
		...products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		}),
		group: "main",
	},
	growth: {
		...products.growth({
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		}),
		group: "main",
	},
	sso: products.recurringAddOn({
		id: "sso",
		items: [items.monthlyWords({ includedUsage: 50 })],
	}),
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
	creditPack: products.oneOffAddOn({
		id: "credit-pack",
		items: [items.oneOffMessages({ billingUnits: 100, price: 10 })],
	}),
});

const catalog = (plans: ReturnType<typeof timelineProducts>) =>
	s.products({ list: Object.values(plans) });

const daysFromNow = (days: number) => Date.now() + ms.days(days);

test.concurrent(
	"QA T1: Pro and SSO both attached directly, no saved schedule",
	async () => {
		const plans = timelineProducts();
		await initScenario({
			customerId: "qa-tl-attached",
			setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
			actions: [
				s.billing.attach({ productId: plans.pro.id }),
				s.billing.attach({ productId: plans.sso.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 40,
					timeout: TRACK_TIMEOUT_MS,
				}),
			],
		});
	},
);

test.concurrent("QA T2: SSO saved as an ongoing plan beside Pro", async () => {
	const plans = timelineProducts();
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "qa-tl-ongoing",
		setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
		actions: [s.billing.attach({ productId: plans.pro.id })],
	});

	await autumnV2_2.billing.setPlans({
		customer_id: customerId,
		unscheduled_plans: [{ plan_id: plans.sso.id }],
		phases: [
			{ starts_at: "now", plans: [{ plan_id: plans.pro.id }] },
			{
				starts_at: daysFromNow(NEXT_PHASE_DAYS),
				plans: [{ plan_id: plans.premium.id }],
			},
		],
	});
});

test.concurrent(
	"QA T3: saved switch from Pro to Premium in 30 days",
	async () => {
		const plans = timelineProducts();
		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "qa-tl-saved-switch",
			setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
			actions: [s.billing.attach({ productId: plans.pro.id })],
		});

		await autumnV2_2.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: plans.pro.id }] },
				{
					starts_at: daysFromNow(NEXT_PHASE_DAYS),
					plans: [{ plan_id: plans.premium.id }],
				},
			],
		});
	},
);

test.concurrent("QA T4: SSO already saved to end in 30 days", async () => {
	const plans = timelineProducts();
	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "qa-tl-saved-end",
		setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
		actions: [
			s.billing.attach({ productId: plans.pro.id }),
			s.billing.attach({ productId: plans.sso.id }),
		],
	});

	await autumnV2_2.billing.setPlans({
		customer_id: customerId,
		phases: [
			{
				starts_at: "now",
				plans: [{ plan_id: plans.pro.id }, { plan_id: plans.sso.id }],
			},
			{
				starts_at: daysFromNow(NEXT_PHASE_DAYS),
				plans: [{ plan_id: plans.pro.id }],
			},
		],
	});
});

test.concurrent(
	"QA T5: three saved phases, Pro then Premium then Growth",
	async () => {
		const plans = timelineProducts();
		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "qa-tl-three-phases",
			setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
			actions: [
				s.billing.attach({ productId: plans.pro.id }),
				s.billing.attach({ productId: plans.bonus.id }),
			],
		});

		await autumnV2_2.billing.setPlans({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: plans.pro.id }, { plan_id: plans.bonus.id }],
				},
				{
					starts_at: daysFromNow(NEXT_PHASE_DAYS),
					plans: [{ plan_id: plans.premium.id }, { plan_id: plans.bonus.id }],
				},
				{
					starts_at: daysFromNow(LATER_PHASE_DAYS),
					plans: [{ plan_id: plans.growth.id }],
				},
			],
		});
	},
);

test.concurrent("QA T6: Pro cancelling at the end of the cycle", async () => {
	const plans = timelineProducts();
	await initScenario({
		customerId: "qa-tl-canceling",
		setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
		actions: [
			s.billing.attach({ productId: plans.pro.id }),
			s.billing.attach({ productId: plans.sso.id }),
			s.updateSubscription({
				productId: plans.pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});
});

test.concurrent(
	"QA T7: SSO on two entities, Pro at customer level",
	async () => {
		const plans = timelineProducts();
		await initScenario({
			customerId: "qa-tl-entities",
			setup: [
				s.customer({ paymentMethod: "success" }),
				catalog(plans),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: plans.pro.id }),
				s.billing.attach({ productId: plans.sso.id, entityIndex: 0 }),
				s.billing.attach({ productId: plans.sso.id, entityIndex: 1 }),
			],
		});
	},
);

test.concurrent(
	"QA T8: Pro and SSO on one subscription, annual support on another",
	async () => {
		const plans = timelineProducts();
		await initScenario({
			customerId: "qa-tl-two-subs",
			setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
			actions: [
				s.billing.attach({ productId: plans.pro.id }),
				s.billing.attach({ productId: plans.sso.id }),
				s.billing.attach({
					productId: plans.annualSupport.id,
					newBillingSubscription: true,
				}),
				s.billing.attach({ productId: plans.bonus.id }),
			],
		});
	},
);

test.concurrent("QA T9: Pro with a one-off credit pack bought", async () => {
	const plans = timelineProducts();
	await initScenario({
		customerId: "qa-tl-one-off",
		setup: [s.customer({ paymentMethod: "success" }), catalog(plans)],
		actions: [
			s.billing.attach({ productId: plans.pro.id }),
			s.billing.attach({
				productId: plans.creditPack.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
			s.track({
				featureId: TestFeature.Messages,
				value: 150,
				timeout: TRACK_TIMEOUT_MS,
			}),
		],
	});
});
