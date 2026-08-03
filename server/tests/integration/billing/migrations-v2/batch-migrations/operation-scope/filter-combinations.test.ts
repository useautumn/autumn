/**
 * Filter COMBINATIONS on multi-product customers:
 *
 *   - catalog matcher forms combine ($in + $nin on plan_id);
 *   - catalog + row constraints AND together (plan_id $in + recurring);
 *   - $or expands per branch: each matched product gets ITS branch's row
 *     scope, on the batch lane;
 *   - $or branches landing on the SAME product (an OR of row predicates)
 *     route to the per-customer lane — and still produce the right rows.
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectWordsOnPlans,
	runScopedMigration,
} from "./operationScopeTestUtils";

test.concurrent(
	`${chalk.yellowBright("operation scope combos: plan_id $in + $nin compose on one matcher")}`,
	async () => {
		const customerId = "os-combo-innin";
		const planA = products.base({ id: "os-combo-innin-a", items: [] });
		const planB = products.base({
			id: "os-combo-innin-b",
			items: [],
			isAddOn: true,
		});
		const planC = products.base({
			id: "os-combo-innin-c",
			items: [],
			isAddOn: true,
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [planA, planB, planC] })],
			actions: [
				s.billing.multiAttach({
					plans: [
						{ productId: planA.id },
						{ productId: planB.id },
						{ productId: planC.id },
					],
				}),
			],
		});

		await runScopedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "os-combo-innin-mig",
			planFilter: {
				plan_id: { $in: [planA.id, planB.id, planC.id], $nin: [planB.id] },
			},
		});

		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [planA.id, planC.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("operation scope combos: catalog + row constraints AND together")}`,
	async () => {
		const customerId = "os-combo-and";
		const freePlan = products.base({ id: "os-combo-and-free", items: [] });
		const recurringAddon = products.recurringAddOn({
			id: "os-combo-and-rec",
			items: [],
		});
		const oneOffAddon = products.oneOffAddOn({
			id: "os-combo-and-oneoff",
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

		// paid AND recurring: excludes the free row (not paid) AND the one-off
		// row (paid but not recurring).
		await runScopedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "os-combo-and-mig",
			planFilter: {
				plan_id: { $in: [freePlan.id, recurringAddon.id, oneOffAddon.id] },
				paid: true,
				recurring: true,
			},
		});

		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [recurringAddon.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("operation scope combos: $or gives each product its own branch scope, on the batch lane")}`,
	async () => {
		const plainId = "os-combo-or-plain";
		const customizedId = "os-combo-or-customized";
		const planA = products.base({ id: "os-combo-or-a", items: [] });
		const planB = products.base({
			id: "os-combo-or-b",
			items: [],
			isAddOn: true,
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: plainId,
			setup: [
				s.customer(),
				s.otherCustomers([{ id: customizedId }]),
				s.products({ list: [planA, planB] }),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: planA.id }),
					s.billing.attach({ productId: planB.id }),
					s.billing.attach({
						customerId: customizedId,
						productId: planA.id,
						items: [items.freeAllocatedWorkflows({ includedUsage: 25 })],
					}),
				),
			],
		});

		// Branch 1: plan A, plain rows only. Branch 2: plan B, any row.
		await runScopedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "os-combo-or-mig",
			planFilter: {
				$or: [{ plan_id: planA.id, custom: false }, { plan_id: planB.id }],
			},
			customerFilter: { plan_id: { $in: [planA.id, planB.id] } },
		});

		// Plain customer: A row (custom: false branch) + B row both gain.
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(plainId),
			planIds: [planA.id, planB.id],
		});
		// Customized customer's A row fails branch 1's custom: false — untouched.
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customizedId),
			planIds: [],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("operation scope combos: same-product $or routes per-customer and still lands the right rows")}`,
	async () => {
		const customerId = "os-combo-sameor";
		const plan = products.base({ id: "os-combo-sameor-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		// Both branches match the same product → OR of row predicates on one
		// product → not expressible as one scope → per-customer lane.
		await runScopedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "os-combo-sameor-mig",
			planFilter: {
				$or: [
					{ plan_id: plan.id, custom: false },
					{ plan_id: plan.id, price: { $eq: null } },
				],
			},
			customerFilter: { plan_id: plan.id },
			expectedLane: "per_customer",
		});

		// The plain free row matches both branches — it must gain Words exactly
		// once.
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [plan.id],
		});
	},
);
