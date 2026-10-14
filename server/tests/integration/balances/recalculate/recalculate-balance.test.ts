import { expect, test } from "bun:test";
import type {
	CheckResponseV2,
	RecalculateBalancePreview,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { waitForPostgresBalance } from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const sumBefore = (preview: RecalculateBalancePreview) =>
	preview.entitlements.reduce((sum, entry) => sum + entry.before_remaining, 0);
const sumAfter = (preview: RecalculateBalancePreview) =>
	preview.entitlements.reduce((sum, entry) => sum + entry.after_remaining, 0);

const breakdownById = (check: CheckResponseV2) =>
	Object.fromEntries(
		(check.balance?.breakdown ?? []).map((entry) => [
			entry.id,
			entry.current_balance,
		]),
	);

test.concurrent(
	`${chalk.yellowBright("recalculate-1: overage is redistributed onto a positive balance")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-1",
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

		const preview = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(preview.total_usage).toBe(130);
		expect(preview.entitlements).toHaveLength(2);
		expect(sumBefore(preview)).toBe(170);
		expect(sumAfter(preview)).toBe(170);
		for (const entry of preview.entitlements) {
			expect(entry.after_remaining).toBeGreaterThanOrEqual(0);
		}
		expect(
			preview.entitlements.some(
				(entry) => entry.after_remaining > entry.before_remaining,
			),
		).toBe(true);

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.balance?.current_balance).toBe(170);
		for (const entry of check.balance?.breakdown ?? []) {
			expect(entry.current_balance).toBeGreaterThanOrEqual(0);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-2: nets overage into the displayed remaining")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-2",
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

		const before = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});

		const preview = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const after = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});

		expect(after.balance?.current_balance).toBeLessThan(
			before.balance?.current_balance ?? 0,
		);
		expect(after.balance?.current_balance).toBe(sumAfter(preview));
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-3: preview returns the diff without persisting")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-3",
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

		const before = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});

		const preview = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(preview.total_usage).toBe(130);
		expect(preview.entitlements).toHaveLength(2);
		expect(sumAfter(preview)).toBe(sumBefore(preview));
		expect(
			preview.entitlements.some(
				(entry) => entry.before_remaining !== entry.after_remaining,
			),
		).toBe(true);

		const after = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(breakdownById(after)).toEqual(breakdownById(before));
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-4: no overage is a no-op")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-4",
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

		const before = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});

		const preview = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(preview.total_usage).toBe(0);
		for (const entry of preview.entitlements) {
			expect(entry.after_remaining).toBe(entry.before_remaining);
		}

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const after = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(breakdownById(after)).toEqual(breakdownById(before));
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-5: missing balance returns an error")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-5",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await expectAutumnError({
			func: async () => {
				await autumnV2.balances.recalculate({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-6: residual overage is consolidated when usage exceeds grant")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-6",
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
			included_grant: 50,
			balance_id: "balance-b",
		});
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 130,
			balance_id: "balance-a",
		});
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 40,
			balance_id: "balance-b",
		});

		const preview = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(preview.total_usage).toBe(170);
		expect(preview.entitlements).toHaveLength(2);
		expect(sumAfter(preview)).toBe(-20);
		expect(sumBefore(preview)).toBe(-20);
		expect(
			preview.entitlements.filter((entry) => entry.after_remaining < 0),
		).toHaveLength(1);

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const rerun = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		for (const entry of rerun.entitlements) {
			expect(entry.after_remaining).toBe(entry.before_remaining);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-7: redistributes across three balances")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-7",
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		for (const balanceId of ["balance-a", "balance-b", "balance-c"]) {
			await autumnV2.balances.create({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				included_grant: 100,
				balance_id: balanceId,
			});
		}

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 130,
			balance_id: "balance-a",
		});

		const preview = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(preview.total_usage).toBe(130);
		expect(preview.entitlements).toHaveLength(3);
		expect(sumBefore(preview)).toBe(170);
		expect(sumAfter(preview)).toBe(170);
		for (const entry of preview.entitlements) {
			expect(entry.after_remaining).toBeGreaterThanOrEqual(0);
		}

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.balance?.current_balance).toBe(170);
		for (const entry of check.balance?.breakdown ?? []) {
			expect(entry.current_balance).toBeGreaterThanOrEqual(0);
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-8: recalculation is idempotent")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-8",
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

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const first = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const second = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});

		expect(breakdownById(second)).toEqual(breakdownById(first));
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-9: redistribution stays within entity scope")}`,
	async () => {
		const { customerId, autumnV2, entities } = await initScenario({
			customerId: "recalc-9",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Admin }),
			],
			actions: [],
		});
		const entityId = entities[0].id;

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 100,
			balance_id: "cust-a",
		});
		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 200,
			balance_id: "cust-b",
		});
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 130,
			balance_id: "cust-a",
		});

		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			included_grant: 100,
			balance_id: "ent-a",
		});
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			current_balance: 60,
			balance_id: "ent-a",
		});

		const entityBefore = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			skip_cache: true,
		});

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const entityAfter = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			skip_cache: true,
		});
		expect(breakdownById(entityAfter)["ent-a"]).toBe(
			breakdownById(entityBefore)["ent-a"],
		);
		expect(breakdownById(entityAfter)["ent-a"]).toBe(60);
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-10: a fully-used balance alongside positives is a no-op")}`,
	async () => {
		const { customerId, autumnV2 } = await initScenario({
			customerId: "recalc-10",
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
		await autumnV2.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			included_grant: 500,
			balance_id: "balance-c",
		});

		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 100,
			balance_id: "balance-a",
		});
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 200,
			balance_id: "balance-c",
		});

		const before = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});

		const preview = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		for (const entry of preview.entitlements) {
			expect(entry.after_remaining).toBe(entry.before_remaining);
		}

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const after = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(breakdownById(after)).toEqual(breakdownById(before));
	},
);

test.concurrent(
	`${chalk.yellowBright("recalculate-11: absorbs negative carry-over into the new plan")}`,
	async () => {
		const pro = products.pro({
			id: "recalc-negative-carry-over-pro",
			items: [items.consumableMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "recalc-negative-carry-over-premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV2, autumnV2_1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "recalc-negative-carry-over",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [s.attach({ productId: pro.id, timeout: 4000 })],
			});

		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 120,
		});
		const cusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await waitForPostgresBalance({
			db: ctx.db,
			customerEntitlementId: cusEnt!.id,
			expectedBalance: -20,
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: premium.id,
			carry_over_balances: { enabled: true },
		});

		const preview = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(preview.total_usage).toBe(20);
		expect(sumBefore(preview)).toBe(480);
		expect(sumAfter(preview)).toBe(480);
		expect(
			preview.entitlements.some(
				(entry) => entry.before_remaining !== entry.after_remaining,
			),
		).toBe(true);

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		const check = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(check.balance?.current_balance).toBe(480);
		for (const entry of check.balance?.breakdown ?? []) {
			expect(entry.current_balance).toBeGreaterThanOrEqual(0);
		}
	},
);
