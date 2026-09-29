// set_plans rejects the requests attach's guards reject, with attach's messages.

import { test } from "bun:test";
import { ErrCode, ms } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("set-plans guards: billing_behavior none rejected when removing a live trial")}`,
	async () => {
		const proTrial = products.proWithTrial({
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-guard-proration",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
			],
			actions: [s.billing.attach({ productId: proTrial.id })],
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage:
				"Cannot set proration_behavior to 'none' when removing a free trial",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					free_trial: null,
					billing_behavior: "none",
					phases: [{ starts_at: "now", plans: [{ plan_id: proTrial.id }] }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans guards: duplicate subscription_id within one phase is rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-guard-dup-sub-id",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [],
		});

		await expectAutumnError({
			errCode: ErrCode.DuplicateSubscriptionId,
			errMessage: "Duplicate subscription_id 'same-sub' in the same request",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					phases: [
						{
							starts_at: "now",
							plans: [
								{ plan_id: pro.id, subscription_id: "same-sub" },
								{ plan_id: addOn.id, subscription_id: "same-sub" },
							],
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans guards: subscription_id on a retained active plan is rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { customerId, autumnV2_4 } = await initScenario({
			customerId: "set-plans-guard-sub-id-in-use",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addOn.id, subscriptionId: "addon-sub" }),
			],
		});

		await expectAutumnError({
			errCode: ErrCode.DuplicateSubscriptionId,
			errMessage: "subscription_id 'addon-sub' is already in use",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id, subscription_id: "addon-sub" }],
						},
					],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans guards: more than 10 Stripe schedule phases is rejected")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-guard-phase-limit",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const futurePhases = Array.from({ length: 11 }, (_, index) => ({
			starts_at: advancedTo + ms.days(30 * (index + 1)),
			plans: [{ plan_id: index % 2 === 0 ? premium.id : pro.id }],
		}));

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "Stripe subscription schedules support at most 10 phases",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					phases: [
						{ starts_at: "now", plans: [{ plan_id: pro.id }] },
						...futurePhases,
					],
				}),
		});
	},
);
