import { test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════
// Test 1: Cannot multi-attach a product the customer already has
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach error: cannot re-attach same product customer already has")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [usersItem],
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "ma-err-same-product",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Multi-attach includes the same pro product customer already has
	await expectAutumnError({
		errMessage: "already has this product active",
		func: async () => {
			await autumnV1.billing.multiAttach({
				customer_id: customerId,
				plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 2: Cannot multi-attach two main plans in one group and scope
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach error: conflicting plans in one scope")}`, async () => {
	const planA = products.base({
		id: "plan-a",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const planB = products.base({
		id: "plan-b",
		items: [items.monthlyUsers({ includedUsage: 5 })],
	});

	const { customerId, autumnV2_2 } = await initScenario({
		customerId: "ma-err-same-group-scope",
		setup: [s.customer({ testClock: false }), s.products({ list: [planA, planB] })],
		actions: [],
	});

	await expectAutumnError({
		errMessage: "at most one plan per group and scope",
		func: async () => {
			await autumnV2_2.billing.multiAttach({
				customer_id: customerId,
				plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 3: redirect_mode "always" with existing subscription → error
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach error: redirect always with existing subscription")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	const existingPlan = products.pro({
		id: "existing",
		items: [messagesItem],
	});

	const newPlan = products.base({
		id: "new-plan",
		items: [usersItem, items.monthlyPrice({ price: 10 })],
		group: "group-b",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "ma-err-redirect-always-existing-sub",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [existingPlan, newPlan] }),
		],
		actions: [s.billing.attach({ productId: existingPlan.id })],
	});

	await expectAutumnError({
		errMessage: "redirect_mode cannot be",
		func: async () => {
			await autumnV1.billing.multiAttach(
				{
					customer_id: customerId,
					plans: [{ plan_id: newPlan.id }],
					redirect_mode: "always",
				},
				{ timeout: 0 },
			);
		},
	});
});

test.concurrent(
	chalk.yellowBright("multi-attach error: cannot replace products across subscriptions"),
	async () => {
		const existingA = products.base({
			id: "existing-a",
			items: [items.monthlyPrice({ price: 5 })],
		});
		const existingB = products.base({
			id: "existing-b",
			items: [items.monthlyPrice({ price: 10 })],
			group: "group-b",
		});
		const replacementA = products.base({
			id: "replacement-a",
			items: [items.monthlyPrice({ price: 15 })],
		});
		const replacementB = products.base({
			id: "replacement-b",
			items: [items.monthlyPrice({ price: 20 })],
			group: "group-b",
		});

		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "ma-err-multiple-subscriptions",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({
					list: [existingA, existingB, replacementA, replacementB],
				}),
			],
			actions: [
				s.billing.attach({ productId: existingA.id }),
				s.billing.attach({
					productId: existingB.id,
					newBillingSubscription: true,
				}),
			],
		});

		await expectAutumnError({
			errMessage: "multiple existing subscriptions",
			func: () =>
				autumnV2_2.billing.multiAttach({
					customer_id: customerId,
					plans: [
						{ plan_id: replacementA.id },
						{ plan_id: replacementB.id },
					],
				}),
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [existingA.id, existingB.id],
			notPresent: [replacementA.id, replacementB.id],
		});
		await expectSubCount({ ctx, customerId, count: 2 });
	},
);

test.concurrent(
	chalk.yellowBright(
		"multi-attach error: scoped add-ons cannot span existing subscriptions",
	),
	async () => {
		const base = products.base({
			id: "scoped-base",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const addOn = products.recurringAddOn({
			id: "scoped-add-on",
			items: [items.monthlyWords({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_2, customerId, entities } =
			await initScenario({
				customerId: "ma-err-scoped-add-ons-multiple-subscriptions",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [base, addOn] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.billing.attach({ productId: base.id, entityIndex: 0 }),
					s.billing.attach({
						productId: base.id,
						entityIndex: 1,
						newBillingSubscription: true,
					}),
				],
			});

		await expectAutumnError({
			errMessage: "multiple existing subscriptions",
			func: () =>
				autumnV2_2.billing.multiAttach({
					customer_id: customerId,
					plans: entities.map((entity) => ({
						plan_id: addOn.id,
						entity_id: entity.id,
					})),
				}),
		});

		const scopedEntities = await Promise.all(
			entities.map((entity) =>
				autumnV1.entities.get<ApiEntityV0>(customerId, entity.id),
			),
		);
		for (const entity of scopedEntities) {
			await expectCustomerProducts({
				customer: entity,
				active: [base.id],
				notPresent: [addOn.id],
			});
		}
		await expectSubCount({ ctx, customerId, count: 2 });
	},
);

test.concurrent(
	chalk.yellowBright("multi-attach error: revert trial requires an existing subscription"),
	async () => {
		const plan = products.base({
			id: "revert-plan",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const { customerId, autumnV2_2 } = await initScenario({
			customerId: "ma-err-revert-without-subscription",
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [],
		});

		await expectAutumnError({
			errMessage: "without an existing paid subscription",
			func: () =>
				autumnV2_2.billing.multiAttach({
					customer_id: customerId,
					plans: [{ plan_id: plan.id }],
					free_trial: {
						duration_length: 14,
						duration_type: "day",
						on_end: "revert",
					},
				}),
		});
	},
);

// ═══════════════════════════════════════════════════════════════════
// Test 4: redirect_mode "always" on entity without new_billing_sub → error
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach error: redirect always on entity without new_billing_sub")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	const customerPlan = products.pro({
		id: "cus-plan",
		items: [messagesItem],
	});

	const entityPlanA = products.base({
		id: "ent-plan-a",
		items: [usersItem, items.monthlyPrice({ price: 10 })],
	});
	const entityPlanB = products.base({
		id: "ent-plan-b",
		items: [items.dashboard(), items.monthlyPrice({ price: 5 })],
		group: "group-b",
	});

	const { customerId, autumnV1, entities } = await initScenario({
		customerId: "ma-err-redirect-entity-no-new-sub",
		setup: [
			s.customer({ paymentMethod: "success", testClock: true }),
			s.products({ list: [customerPlan, entityPlanA, entityPlanB] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: customerPlan.id })],
	});

	await expectSubCount({ ctx, customerId, count: 1 });

	await expectAutumnError({
		errMessage: "redirect_mode cannot be",
		func: async () => {
			await autumnV1.billing.multiAttach(
				{
					customer_id: customerId,
					entity_id: entities[0].id,
					plans: [{ plan_id: entityPlanA.id }, { plan_id: entityPlanB.id }],
					redirect_mode: "always",
				},
				{ timeout: 0 },
			);
		},
	});
});
