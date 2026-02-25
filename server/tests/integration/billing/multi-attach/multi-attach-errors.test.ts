import { test } from "bun:test";
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
// Test 2: Cannot multi-attach with more than one plan transition
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach error: multiple transitions in one batch")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const usersItem = items.monthlyUsers({ includedUsage: 5 });

	// Customer has products in two groups
	const existingA = products.base({
		id: "existing-a",
		items: [messagesItem, items.monthlyPrice({ price: 5 })],
	});
	const existingB = products.base({
		id: "existing-b",
		items: [usersItem, items.monthlyPrice({ price: 5 })],
		group: "group-b",
	});

	// Multi-attach tries to replace both groups
	const replacementA = products.pro({
		id: "replacement-a",
		items: [messagesItem],
	});
	const replacementB = products.base({
		id: "replacement-b",
		items: [usersItem, items.monthlyPrice({ price: 20 })],
		group: "group-b",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "ma-err-multi-transition",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({
				list: [existingA, existingB, replacementA, replacementB],
			}),
		],
		actions: [
			s.billing.attach({ productId: existingA.id }),
			s.billing.attach({ productId: existingB.id }),
		],
	});

	await expectAutumnError({
		errMessage: "at most one plan transition",
		func: async () => {
			await autumnV1.billing.multiAttach({
				customer_id: customerId,
				plans: [{ plan_id: replacementA.id }, { plan_id: replacementB.id }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 3: Cannot multi-attach two plans with the same prepaid feature
// ═══════════════════════════════════════════════════════════════════
test.concurrent(`${chalk.yellowBright("multi-attach error: duplicate prepaid feature across plans")}`, async () => {
	const planA = products.pro({
		id: "plan-a",
		items: [items.prepaidMessages({ includedUsage: 100, price: 5 })],
	});

	const planB = products.base({
		id: "plan-b",
		items: [
			items.prepaidMessages({ includedUsage: 200, price: 10 }),
			items.monthlyPrice({ price: 15 }),
		],
		group: "group-b",
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "ma-err-dup-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [planA, planB] }),
		],
		actions: [],
	});

	await expectAutumnError({
		errMessage: "prepaid pricing in both plan",
		func: async () => {
			await autumnV1.billing.multiAttach({
				customer_id: customerId,
				plans: [{ plan_id: planA.id }, { plan_id: planB.id }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════
// Test 4: redirect_mode "always" with existing subscription → error
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

// ═══════════════════════════════════════════════════════════════════
// Test 5: redirect_mode "always" on entity without new_billing_sub → error
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
