/**
 * THE isolation property: an operation's plan filter must NEVER touch a
 * customer product it doesn't match — proven on ONE customer holding several
 * products (free base + paid recurring add-on + paid one-off add-on), where
 * every row filter matches a strict subset of their rows.
 *
 * Contract under test (Words breakdown = exact per-row proof):
 *   - paid: true       → only the two paid add-on rows gain Words;
 *   - recurring: true  → only the recurring add-on row;
 *   - recurring: false → the free base + one-off rows, never the recurring;
 *   - price: {$eq: null} → only the base-price-less free row;
 *   - price: {$ne: null} → only the add-on rows with base prices.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectWordsOnPlans,
	runScopedMigration,
} from "./operationScopeTestUtils";

/** One customer, three coexisting products with distinct row shapes. */
const initThreeProductCustomer = async ({
	customerId,
	prefix,
}: {
	customerId: string;
	prefix: string;
}) => {
	const freePlan = products.base({ id: `${prefix}-free`, items: [] });
	const recurringAddon = products.recurringAddOn({
		id: `${prefix}-rec`,
		items: [],
	});
	const oneOffAddon = products.oneOffAddOn({
		id: `${prefix}-oneoff`,
		items: [],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freePlan, recurringAddon, oneOffAddon] }),
		],
		actions: [
			s.billing.multiAttach({
				plans: [
					{ productId: freePlan.id },
					{ productId: recurringAddon.id },
					{ productId: oneOffAddon.id },
				],
			}),
		],
	});

	return {
		autumnV2_2,
		ctx,
		allPlanIds: [freePlan.id, recurringAddon.id, oneOffAddon.id],
		freePlan,
		recurringAddon,
		oneOffAddon,
	};
};

const scenarios = [
	{
		key: "paid-true",
		planFilter: { paid: true },
		expectPlans: ({
			recurringAddon,
			oneOffAddon,
		}: Awaited<ReturnType<typeof initThreeProductCustomer>>) => [
			recurringAddon.id,
			oneOffAddon.id,
		],
	},
	{
		key: "recurring-true",
		planFilter: { recurring: true },
		expectPlans: ({
			recurringAddon,
		}: Awaited<ReturnType<typeof initThreeProductCustomer>>) => [
			recurringAddon.id,
		],
	},
	{
		key: "recurring-false",
		planFilter: { recurring: false },
		expectPlans: ({
			freePlan,
			oneOffAddon,
		}: Awaited<ReturnType<typeof initThreeProductCustomer>>) => [
			freePlan.id,
			oneOffAddon.id,
		],
	},
	{
		key: "price-eq-null",
		planFilter: { price: { $eq: null } },
		expectPlans: ({
			freePlan,
		}: Awaited<ReturnType<typeof initThreeProductCustomer>>) => [freePlan.id],
	},
	{
		key: "price-ne-null",
		planFilter: { price: { $ne: null } },
		expectPlans: ({
			recurringAddon,
			oneOffAddon,
		}: Awaited<ReturnType<typeof initThreeProductCustomer>>) => [
			recurringAddon.id,
			oneOffAddon.id,
		],
	},
] as const;

for (const scenario of scenarios) {
	test.concurrent(
		`${chalk.yellowBright(`operation scope isolation: ${scenario.key} touches only matching rows of a multi-product customer`)}`,
		async () => {
			const customerId = `os-iso-${scenario.key}`;
			const setup = await initThreeProductCustomer({
				customerId,
				prefix: `os-iso-${scenario.key}`,
			});

			await runScopedMigration({
				ctx: setup.ctx,
				migrationClient: setup.autumnV2_2,
				migrationId: `os-iso-${scenario.key}-mig`,
				planFilter: {
					plan_id: { $in: setup.allPlanIds },
					...scenario.planFilter,
				},
			});

			const customer =
				await setup.autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			const expected = scenario.expectPlans(setup);
			expectWordsOnPlans({ customer, planIds: expected });
			// The complement stayed untouched by construction of the breakdown
			// assertion, but make the intent explicit:
			expect(expected.length).toBeLessThan(setup.allPlanIds.length);
		},
	);
}
