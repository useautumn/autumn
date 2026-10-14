import { expect, test } from "bun:test";
import {
	customerEntitlements,
	EntInterval,
	getNextResetAt,
	ms,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq, sql } from "drizzle-orm";
import {
	fetchCustomerEntitlementRow,
	runBatchResetV2,
	waitForPostgresBalance,
} from "./batchResetV2TestUtils.js";

const INCLUDED_USAGE = 100;

const initBasicScenario = async ({
	customerId,
	trackValue,
}: {
	customerId: string;
	trackValue?: number;
}) => {
	const plan = products.base({
		id: "batch-reset-basic",
		items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [
			s.attach({ productId: plan.id }),
			...(trackValue
				? [
						s.track({
							featureId: TestFeature.Messages,
							value: trackValue,
							timeout: 3000,
						}),
					]
				: []),
		],
	});

	const customerEntitlement = await findCustomerEntitlement({
		ctx: scenario.ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(customerEntitlement).toBeDefined();

	return { ...scenario, customerEntitlement: customerEntitlement! };
};

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: regular reset restores balance and advances next_reset_at")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-regular";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
			trackValue: 30,
		});

		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
			expectedBalance: INCLUDED_USAGE - 30,
		});

		const pastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});
		const rowBefore = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		expect(result.resetMutations.length).toBe(1);
		expect(result.verdicts.length).toBe(0);

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.balance).toBe(INCLUDED_USAGE);
		expect(row.adjustment).toBe(0);

		const expectedNextResetAt = getNextResetAt({
			curReset: pastTime,
			interval: EntInterval.Month,
			intervalCount: 1,
			now: Date.now(),
		});
		expect(row.next_reset_at).toBe(expectedNextResetAt);
		expect(row.next_reset_at!).toBeGreaterThan(Date.now());

		expect(row.cache_version!).toBe((rowBefore.cache_version ?? 0) + 1);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: multi-cycle catch-up lands within one interval of now")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-catchup";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
		});

		const pastTime = Date.now() - ms.days(190);
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.next_reset_at!).toBeGreaterThan(Date.now());
		expect(row.next_reset_at!).toBeLessThanOrEqual(Date.now() + ms.days(32));
		expect(row.next_reset_at).toBe(
			getNextResetAt({
				curReset: pastTime,
				interval: EntInterval.Month,
				intervalCount: 1,
				now: Date.now(),
			}),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: month-end boundary reset advances per getNextResetAt")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-boundary";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
		});

		const pastTime = Date.UTC(2026, 0, 31, 10, 0, 0);
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});

		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.next_reset_at).toBe(
			getNextResetAt({
				curReset: pastTime,
				interval: EntInterval.Month,
				intervalCount: 1,
				now: Date.now(),
			}),
		);
		expect(row.next_reset_at!).toBeGreaterThan(Date.now());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: legacy entities blob with null id still resets")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-legacy-entities";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
		});

		await ctx.db.execute(sql`
			UPDATE ${customerEntitlements}
			SET entities = ${JSON.stringify({
				null: { id: null, balance: 50, adjustment: 0 },
			})}::jsonb
			WHERE id = ${customerEntitlement.id}
		`);

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		expect(result.resetMutations.length).toBe(1);
		const row = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(row.balance).toBe(INCLUDED_USAGE);
		expect(row.next_reset_at!).toBeGreaterThan(Date.now());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: unknown IDs are handled without mutations")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-missing";
		const { ctx } = await initBasicScenario({ customerId });

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: ["cus_ent_does_not_exist_v2_test"],
		});

		expect(result.resetMutations.length).toBe(0);
		expect(result.verdicts.length).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 basic: redelivery of an already-reset row is a no-op")}`,
	async () => {
		const customerId = "batch-reset-v2-basic-idempotent";
		const { ctx, customerEntitlement } = await initBasicScenario({
			customerId,
		});

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		const rowAfterFirstReset = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rowAfterFirstReset.balance).toBe(INCLUDED_USAGE);

		await ctx.db
			.update(customerEntitlements)
			.set({ balance: INCLUDED_USAGE - 10 })
			.where(eq(customerEntitlements.id, customerEntitlement.id));

		const secondRun = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		expect(secondRun.resetMutations.length).toBe(0);

		const rowAfterSecondRun = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rowAfterSecondRun.balance).toBe(INCLUDED_USAGE - 10);
		expect(rowAfterSecondRun.next_reset_at).toBe(
			rowAfterFirstReset.next_reset_at,
		);
	},
);
