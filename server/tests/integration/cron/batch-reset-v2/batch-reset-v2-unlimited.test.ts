/**
 * Unlimited entitlements can carry a reset interval. A monthly unlimited grant
 * seeds next_reset_at like any consumable, and the V2 batch reset worker
 * resets its usage counter (negative balance) back to 0 on schedule. One-off
 * unlimited stays exactly as before: no next_reset_at, never reset.
 *
 * Red (current):
 *   - attach unlimited monthly -> next_reset_at is null (isResettingEntitlement
 *     excludes unlimited)
 *   - batch reset -> verdict clear_next_reset, no mutation, usage untouched
 * Green (after):
 *   - next_reset_at seeded ~1 month out
 *   - batch reset -> one mutation, balance 0 (and every entity 0), usage 0
 *   - org.persist_free_overage never applies: the unlimited counter is not
 *     owed overage, so it still resets to 0
 */

import { expect, test } from "bun:test";
import { EntInterval, ms, ProductItemInterval } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getNextResetAt } from "@/utils/timeUtils.js";
import {
	fetchCustomerEntitlementRow,
	runBatchResetV2,
	waitForPostgresBalance,
} from "./batchResetV2TestUtils.js";

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 unlimited: monthly unlimited seeds next_reset_at and resets usage to 0")}`,
	async () => {
		const customerId = "batch-reset-v2-unlim-monthly";
		const plan = products.base({
			id: "unlim-monthly",
			items: [
				items.unlimited({
					featureId: TestFeature.Messages,
					interval: ProductItemInterval.Month,
				}),
			],
		});
		const tracked = 30;

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: tracked,
					timeout: 3000,
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();
		expect(customerEntitlement!.next_reset_at).toBeGreaterThan(Date.now());
		expect(customerEntitlement!.next_reset_at).toBeLessThanOrEqual(
			Date.now() + ms.days(32),
		);

		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
			expectedBalance: -tracked,
		});

		const pastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});
		expect(result.resetMutations.length).toBe(1);
		expect(result.verdicts.length).toBe(0);

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(row.balance).toBe(0);
		expect(row.next_reset_at).toBe(
			getNextResetAt({
				curReset: new UTCDate(pastTime),
				interval: EntInterval.Month,
				intervalCount: 1,
			}),
		);

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			skipCache: true,
			usage: 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 unlimited: entity-scoped monthly unlimited resets every entity to 0")}`,
	async () => {
		const customerId = "batch-reset-v2-unlim-entity";
		const plan = products.base({
			id: "unlim-entity-monthly",
			items: [
				items.unlimited({
					featureId: TestFeature.Messages,
					entityFeatureId: TestFeature.Users,
					interval: ProductItemInterval.Month,
				}),
			],
		});
		const entityUsages = [10, 25];

		const { ctx, autumnV1, autumnV2_3, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: plan.id })],
		});

		for (const [index, entity] of entities.entries()) {
			await autumnV1.track(
				{
					customer_id: customerId,
					entity_id: entity.id,
					feature_id: TestFeature.Messages,
					value: entityUsages[index],
				},
				{ timeout: 3000 },
			);
		}
		for (const [index, entity] of entities.entries()) {
			await expectBalanceCorrect({
				customerId,
				entityId: entity.id,
				autumn: autumnV2_3,
				featureId: TestFeature.Messages,
				skipCache: true,
				usage: entityUsages[index],
			});
		}

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();
		expect(customerEntitlement!.next_reset_at).toBeGreaterThan(Date.now());

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});
		expect(result.resetMutations.length).toBe(1);

		for (const entity of entities) {
			await expectBalanceCorrect({
				customerId,
				entityId: entity.id,
				autumn: autumnV2_3,
				featureId: TestFeature.Messages,
				skipCache: true,
				usage: 0,
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 unlimited: one-off unlimited has no next_reset_at and is never reset")}`,
	async () => {
		const customerId = "batch-reset-v2-unlim-oneoff";
		const plan = products.base({
			id: "unlim-oneoff",
			items: [items.unlimitedMessages()],
		});
		const tracked = 30;

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: tracked,
					timeout: 3000,
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();
		expect(customerEntitlement!.next_reset_at).toBeNull();

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});
		expect(result.resetMutations.length).toBe(0);

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			skipCache: true,
			usage: tracked,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 unlimited: persist_free_overage does not carry the unlimited counter")}`,
	async () => {
		const customerId = "batch-reset-v2-unlim-persist";
		const plan = products.base({
			id: "unlim-persist",
			items: [
				items.unlimited({
					featureId: TestFeature.Messages,
					interval: ProductItemInterval.Month,
				}),
			],
		});
		const tracked = 500;

		const { ctx, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					userEmail: `unlim-persist-${Math.random().toString(36).slice(2, 8)}@autumn.test`,
					configOverrides: { persist_free_overage: true },
					setupDefaultFeatures: true,
				}),
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({ productId: plan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: tracked,
					timeout: 3000,
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();
		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
			expectedBalance: -tracked,
		});

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});
		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});
		expect(result.resetMutations.length).toBe(1);

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(row.balance).toBe(0);

		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_3,
			featureId: TestFeature.Messages,
			skipCache: true,
			usage: 0,
		});
	},
);
