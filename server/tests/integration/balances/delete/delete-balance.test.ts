import { expect, test } from "bun:test";
import {
	type CheckResponseV2,
	customerEntitlements,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, or } from "drizzle-orm";

type TestCtx = Awaited<ReturnType<typeof initScenario>>["ctx"];

const expectRawBalance = async ({
	ctx,
	customerId,
	balanceId,
	balance,
	entityId,
}: {
	ctx: TestCtx;
	customerId: string;
	balanceId: string;
	balance: number;
	entityId?: string;
}) => {
	const rows = await ctx.db
		.select({
			balance: customerEntitlements.balance,
			entities: customerEntitlements.entities,
		})
		.from(customerEntitlements)
		.where(
			and(
				eq(customerEntitlements.customer_id, customerId),
				or(
					eq(customerEntitlements.id, balanceId),
					eq(customerEntitlements.external_id, balanceId),
				),
			),
		)
		.limit(1);

	expect(rows).toHaveLength(1);
	expect(
		entityId
			? (rows[0].entities as Record<string, { balance: number }>)[entityId]
					?.balance
			: rows[0].balance,
	).toBe(balance);
};

test.concurrent(
	`${chalk.yellowBright("delete-balance-1: basic delete of loose balance removes it")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-1",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "del-bal-1-balance",
		});

		const before = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(before.balance?.breakdown).toHaveLength(1);

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "del-bal-1-balance",
		});

		const afterCache = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(afterCache.balance?.breakdown ?? []).toHaveLength(0);

		const afterDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(afterDb.balance?.breakdown ?? []).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2: balance_id targets only the correct balance")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-2",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "balance-a",
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 200,
			balance_id: "balance-b",
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "balance-a",
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(check.balance?.breakdown).toHaveLength(1);
		expect(check.balance?.breakdown?.[0].id).toBe("balance-b");
		expect(check.balance?.current_balance).toBe(200);

		const checkDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(checkDb.balance?.breakdown).toHaveLength(1);
		expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2a: default delete does not deduct deleted remaining amount")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-2a",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "balance-a",
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 200,
			balance_id: "balance-b",
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			remaining: 60,
			balance_id: "balance-a",
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "balance-a",
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(check.balance?.breakdown).toHaveLength(1);
		expect(check.balance?.breakdown?.[0].id).toBe("balance-b");
		expect(check.balance?.current_balance).toBe(200);
		expect(check.balance?.granted_balance).toBe(200);
		expect(check.balance?.usage).toBe(0);
		expect(check.balance?.breakdown?.[0].current_balance).toBe(200);
		expect(check.balance?.breakdown?.[0].granted_balance).toBe(200);
		expect(check.balance?.breakdown?.[0].usage).toBe(0);

		const checkDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(checkDb.balance?.breakdown).toHaveLength(1);
		expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
		expect(checkDb.balance?.current_balance).toBe(200);
		expect(checkDb.balance?.granted_balance).toBe(200);
		expect(checkDb.balance?.usage).toBe(0);
		expect(checkDb.balance?.breakdown?.[0].current_balance).toBe(200);
		expect(checkDb.balance?.breakdown?.[0].granted_balance).toBe(200);
		expect(checkDb.balance?.breakdown?.[0].usage).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2b: recalculate_balances deducts deleted usage amount")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-2b",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "balance-a",
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 200,
			balance_id: "balance-b",
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			remaining: 60,
			balance_id: "balance-a",
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "balance-a",
			recalculate_balances: true,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		expect(check.balance?.breakdown).toHaveLength(1);
		expect(check.balance?.breakdown?.[0].id).toBe("balance-b");
		expect(check.balance?.current_balance).toBe(160);
		expect(check.balance?.granted_balance).toBe(200);
		expect(check.balance?.usage).toBe(40);
		expect(check.balance?.breakdown?.[0].current_balance).toBe(160);
		expect(check.balance?.breakdown?.[0].granted_balance).toBe(200);
		expect(check.balance?.breakdown?.[0].usage).toBe(40);

		const checkDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(checkDb.balance?.breakdown).toHaveLength(1);
		expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
		expect(checkDb.balance?.current_balance).toBe(160);
		expect(checkDb.balance?.granted_balance).toBe(200);
		expect(checkDb.balance?.usage).toBe(40);
		expect(checkDb.balance?.breakdown?.[0].current_balance).toBe(160);
		expect(checkDb.balance?.breakdown?.[0].granted_balance).toBe(200);
		expect(checkDb.balance?.breakdown?.[0].usage).toBe(40);
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2c: recalculate_balances requires feature_id")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-2c",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "balance-a",
		});

		await expectAutumnError({
			errMessage: "feature_id is required when recalculate_balances is true",
			func: async () => {
				await autumnV2.balances.delete({
					customer_id: customerId,
					balance_id: "balance-a",
					recalculate_balances: true,
				});
			},
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance?.breakdown).toHaveLength(1);
		expect(check.balance?.breakdown?.[0].id).toBe("balance-a");
		expect(check.balance?.current_balance).toBe(100);
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2d: recalculate_balances deducts deleted overage usage")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-2d",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "balance-a",
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 200,
			balance_id: "balance-b",
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 130,
			balance_id: "balance-a",
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "balance-a",
			recalculate_balances: true,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance?.breakdown).toHaveLength(1);
		expect(check.balance?.breakdown?.[0].id).toBe("balance-b");
		expect(check.balance?.current_balance).toBe(70);
		expect(check.balance?.granted_balance).toBe(200);
		expect(check.balance?.usage).toBe(130);

		const checkDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(checkDb.balance?.breakdown).toHaveLength(1);
		expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-b");
		expect(checkDb.balance?.current_balance).toBe(70);
		expect(checkDb.balance?.granted_balance).toBe(200);
		expect(checkDb.balance?.usage).toBe(130);
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2e: recalculate_balances converts only balance to overage")}`,
	async () => {
		const { customerId, autumnV2, ctx } = await initScenario({
			customerId: "del-bal-2e",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "balance-a",
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			remaining: 60,
			balance_id: "balance-a",
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "balance-a",
			recalculate_balances: true,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance?.breakdown).toHaveLength(1);
		expect(check.balance?.breakdown?.[0].id).toBe("balance-a");
		expect(check.balance?.current_balance).toBe(0);
		expect(check.balance?.granted_balance).toBe(0);
		expect(check.balance?.purchased_balance).toBe(40);
		expect(check.balance?.usage).toBe(40);

		const checkDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(checkDb.balance?.breakdown).toHaveLength(1);
		expect(checkDb.balance?.breakdown?.[0].id).toBe("balance-a");
		expect(checkDb.balance?.current_balance).toBe(0);
		expect(checkDb.balance?.granted_balance).toBe(0);
		expect(checkDb.balance?.purchased_balance).toBe(40);
		expect(checkDb.balance?.usage).toBe(40);
		await expectRawBalance({
			ctx,
			customerId,
			balanceId: "balance-a",
			balance: -40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2f: converted overage balance does not reset")}`,
	async () => {
		const { customerId, autumnV2, ctx } = await initScenario({
			customerId: "del-bal-2f",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "del-bal-2f-balance",
			reset: { interval: ResetInterval.Month },
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			remaining: 60,
			balance_id: "del-bal-2f-balance",
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "del-bal-2f-balance",
			recalculate_balances: true,
		});

		const rows = await ctx.db
			.select({
				next_reset_at: customerEntitlements.next_reset_at,
				reset_cycle_anchor: customerEntitlements.reset_cycle_anchor,
			})
			.from(customerEntitlements)
			.where(eq(customerEntitlements.external_id, "del-bal-2f-balance"))
			.limit(1);

		expect(rows[0]?.next_reset_at).toBeNull();
		expect(rows[0]?.reset_cycle_anchor).toBeNull();

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.balance?.current_balance).toBe(0);
		expect(check.balance?.granted_balance).toBe(0);
		expect(check.balance?.purchased_balance).toBe(40);
		expect(check.balance?.usage).toBe(40);
		await expectRawBalance({
			ctx,
			customerId,
			balanceId: "del-bal-2f-balance",
			balance: -40,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2g: recalculate_balances converts entity balance to overage")}`,
	async () => {
		const messagesItem = items.monthlyMessages({
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const free = products.base({
			id: "del-bal-2g-free",
			items: [messagesItem],
		});

		const { customerId, autumnV2, entities, ctx } = await initScenario({
			customerId: "del-bal-2g",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [free] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: free.id })],
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			remaining: 60,
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			recalculate_balances: true,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.balance?.current_balance).toBe(0);
		expect(check.balance?.granted_balance).toBe(0);
		expect(check.balance?.purchased_balance).toBe(40);
		expect(check.balance?.usage).toBe(40);
		const balanceId = check.balance?.breakdown?.[0].id;
		expect(balanceId).toBeDefined();
		await expectRawBalance({
			ctx,
			customerId,
			balanceId: balanceId!,
			balance: -40,
			entityId: entities[0].id,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-2h: recalculate_balances converts multiple balances to one overage")}`,
	async () => {
		const { customerId, autumnV2, ctx } = await initScenario({
			customerId: "del-bal-2h",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "del-bal-2h-a",
		});
		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 200,
			balance_id: "del-bal-2h-b",
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "del-bal-2h-a",
			remaining: 60,
		});
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			balance_id: "del-bal-2h-b",
			remaining: 170,
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			recalculate_balances: true,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.balance?.breakdown).toHaveLength(1);
		expect(check.balance?.current_balance).toBe(0);
		expect(check.balance?.granted_balance).toBe(0);
		expect(check.balance?.purchased_balance).toBe(70);
		expect(check.balance?.usage).toBe(70);
		const balanceId = check.balance?.breakdown?.[0].id;
		expect(balanceId).toBeDefined();
		await expectRawBalance({
			ctx,
			customerId,
			balanceId: balanceId!,
			balance: -70,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-3: cannot delete a paid balance")}`,
	async () => {
		const messagesItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({ items: [messagesItem] });

		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-3",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2.balances.delete({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-4: balance not found returns error")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-4",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2.balances.delete({
					customer_id: customerId,
					balance_id: "nonexistent-balance",
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("delete-balance-5: deleting free product balance clears feature")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({ id: "free", items: [messagesItem] });

		const { customerId, autumnV2 } = await initScenario({
			customerId: "del-bal-5",
			setup: [s.customer({ testClock: false }), s.products({ list: [free] })],
			actions: [s.attach({ productId: free.id })],
		});

		await autumnV2.balances.delete({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const afterCache = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(afterCache.balance?.breakdown ?? []).toHaveLength(0);

		const afterDb = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(afterDb.balance?.breakdown ?? []).toHaveLength(0);
	},
);
