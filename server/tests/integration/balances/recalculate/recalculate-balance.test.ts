import { expect, test } from "bun:test";
import type {
	CheckResponseV2,
	RecalculateBalancePreview,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

// Preview returns the projected remaining per entitlement; these helpers sum
// the before/after sides so tests can assert conservation without depending on
// per-balance ordering.
const sumBefore = (preview: RecalculateBalancePreview) =>
	preview.entitlements.reduce((sum, entry) => sum + entry.before_remaining, 0);
const sumAfter = (preview: RecalculateBalancePreview) =>
	preview.entitlements.reduce((sum, entry) => sum + entry.after_remaining, 0);

// Map a check response's breakdown to { balanceId: current_balance } so tests
// can compare distribution without depending on breakdown ordering.
const breakdownById = (check: CheckResponseV2) =>
	Object.fromEntries(
		(check.balance?.breakdown ?? []).map((entry) => [
			entry.id,
			entry.current_balance,
		]),
	);

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-1: An overdrawn balance is healed by redistributing its
// usage onto a sibling balance that still has remaining.
// ═══════════════════════════════════════════════════════════════════

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

		// Drive balance-a into overage (usage 130 on a grant of 100 -> -30).
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			usage: 130,
			balance_id: "balance-a",
		});

		// Preview: total usage 130, aggregate remaining conserved at 170, and the
		// overdrawn balance recovers while no balance is left negative.
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

		// Aggregate remaining is unchanged and nothing is in overage anymore.
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

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-2: Recalculation nets a sibling's overage into the
// displayed remaining, so the aggregate reflects the true
// (granted - usage) remaining afterwards.
// ═══════════════════════════════════════════════════════════════════

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

		// Before: balance-a's overage is not netted against balance-b, so the
		// displayed remaining is inflated (200 rather than the true 170).
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

		// Recalculation reduces the inflated remaining to the true remaining.
		expect(after.balance?.current_balance).toBeLessThan(
			before.balance?.current_balance ?? 0,
		);
		expect(after.balance?.current_balance).toBe(sumAfter(preview));
	},
);

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-3: The preview endpoint returns the projected diff and
// does NOT persist any changes.
// ═══════════════════════════════════════════════════════════════════

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

		// Nothing was written: the on-disk distribution is identical.
		const after = await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			skip_cache: true,
		});
		expect(breakdownById(after)).toEqual(breakdownById(before));
	},
);

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-4: When balances are already distributed (no overage),
// recalculation is a no-op and the preview reports no changes.
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-5: Recalculating a feature with no balances errors.
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-6: When total usage exceeds total grant, the residual
// overage is consolidated onto a single balance and the aggregate is
// still conserved.
// ═══════════════════════════════════════════════════════════════════

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
		// Total grant 150, total usage 170 -> aggregate remaining -20.
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
		// The overage is consolidated onto exactly one balance.
		expect(
			preview.entitlements.filter((entry) => entry.after_remaining < 0),
		).toHaveLength(1);

		await autumnV2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		// Re-previewing the now-recalculated state shows nothing left to do.
		const rerun = await autumnV2.balances.previewRecalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		for (const entry of rerun.entitlements) {
			expect(entry.after_remaining).toBe(entry.before_remaining);
		}
	},
);

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-7: Redistribution works across three balances.
// ═══════════════════════════════════════════════════════════════════

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

		// balance-a overdrawn to -30.
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

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-8: Recalculation is idempotent - running it again does
// not change an already-balanced feature.
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-9: Redistribution stays within scope - a customer-level
// overage is NOT absorbed by an entity-scoped balance.
// ═══════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("recalculate-9: redistribution stays within entity scope")}`,
	async () => {
		const { customerId, autumnV2, entities } = await initScenario({
			customerId: "recalc-9",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});
		const entityId = entities[0].id;

		// Customer-level: one overdrawn (-30), one with remaining (200).
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

		// Entity-scoped: partially used and positive (no overage in this scope).
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

		// The entity-owned balance itself is untouched - the customer-level
		// overage was not absorbed by it. (The entity-level aggregate also
		// reflects shared customer balances, so we target ent-a specifically.)
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

// ═══════════════════════════════════════════════════════════════════
// RECALCULATE-10: A fully-used balance (remaining 0, not overdrawn)
// next to positive balances is NOT recalculable - there is no overage to
// absorb, so the preview reports no changes ("already up to date").
// ═══════════════════════════════════════════════════════════════════

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

		// balance-a is fully used (remaining 0) but NOT overdrawn; balance-c is
		// partially used but still positive.
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

		// No scope has an overage, so the preview reports no changes.
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
