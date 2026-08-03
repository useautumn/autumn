/**
 * Unsupported plan-filter forms must NEVER be silently batch-mishandled:
 *
 *   - `item` navigation → blocked entirely (prepare refuses it before either
 *     lane can mutate anything);
 *   - op-vs-migration disagreement (custom: true vs false) → per-customer
 *     lane; no row matches both, so nothing mutates;
 *   - a row-decidable field inside the MIGRATION filter's $or → per-customer
 *     lane, which then applies the op correctly;
 *   - schema-invalid forms (price: true, custom: {$eq}) are blocked at
 *     migrations.create — they never reach a run at all.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	addWordsOperation,
	expectWordsOnPlans,
	runScopedMigration,
} from "./operationScopeTestUtils";

test.concurrent(
	`${chalk.yellowBright("operation scope unsupported: item filter is blocked entirely, before any mutation")}`,
	async () => {
		const customerId = "os-unsup-item";
		const plan = products.base({ id: "os-unsup-item-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		// `item` navigation has no product-level matcher; prepare refuses it
		// explicitly, so the run fails BEFORE either lane can mutate anything.
		await expect(
			runScopedMigration({
				ctx,
				migrationClient: autumnV2_2,
				migrationId: "os-unsup-item-mig",
				planFilter: {
					plan_id: plan.id,
					item: { feature_id: TestFeature.Messages },
				},
				customerFilter: { plan_id: plan.id },
			}),
		).rejects.toThrow();

		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("operation scope unsupported: cross-level custom disagreement routes per-customer, mutates nothing")}`,
	async () => {
		const customerId = "os-unsup-disagree";
		const plan = products.base({ id: "os-unsup-disagree-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await runScopedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "os-unsup-disagree-mig",
			planFilter: { plan_id: plan.id, custom: true },
			customerFilter: { plan_id: plan.id, custom: false },
			expectedLane: "per_customer",
		});

		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("operation scope unsupported: migration-filter $or with a row field routes per-customer, still applies")}`,
	async () => {
		const customerId = "os-unsup-migor";
		const plan = products.base({ id: "os-unsup-migor-plan", items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await runScopedMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: "os-unsup-migor-mig",
			planFilter: { plan_id: plan.id },
			customerFilter: {
				$or: [{ plan_id: plan.id, custom: false }, { plan_id: plan.id }],
			},
			expectedLane: "per_customer",
		});

		// The fallback lane still executes the op correctly.
		expectWordsOnPlans({
			customer: await autumnV2_2.customers.get<ApiCustomerV5>(customerId),
			planIds: [plan.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("operation scope unsupported: schema-invalid filter forms are blocked at create")}`,
	async () => {
		const customerId = "os-unsup-schema";
		const plan = products.base({ id: "os-unsup-schema-plan", items: [] });

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer(), s.products({ list: [plan] })],
			actions: [],
		});

		const createWith = (planFilter: Record<string, unknown>) =>
			autumnV2_2.migrationsV2.deleteAndCreate({
				id: "os-unsup-schema-mig",
				filter: { customer: { plan: { plan_id: plan.id } } },
				operations: addWordsOperation({
					// biome-ignore lint/suspicious/noExplicitAny: intentionally invalid shape
					planFilter: planFilter as any,
				}),
				no_billing_changes: true,
			});

		// `price` is a null-existence filter, not a boolean.
		await expect(
			createWith({ plan_id: plan.id, price: true }),
		).rejects.toThrow();
		// `custom` is a bare boolean, not a matcher object.
		await expect(
			createWith({ plan_id: plan.id, custom: { $eq: true } }),
		).rejects.toThrow();
	},
);
