import { describe, expect, test } from "bun:test";
import type { UsageWindow, UsageWindowLimit } from "@autumn/shared";
import { computeUsageWindowRolls } from "@/internal/customers/actions/resetUsageWindows/computeUsageWindowRolls.js";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

const row = (overrides: Partial<UsageWindow>): UsageWindow =>
	({
		id: "uw_1",
		internal_customer_id: "cus_int_1",
		internal_entity_id: null,
		feature_id: "messages",
		internal_feature_id: "imessages",
		anchor_customer_entitlement_id: "ce_old",
		window_start_at: NOW - HOUR,
		window_end_at: NOW + HOUR,
		usage: 3,
		updated_at: NOW - HOUR,
		...overrides,
	}) as UsageWindow;

const limit = (overrides: Partial<UsageWindowLimit>): UsageWindowLimit =>
	({
		feature_id: "messages",
		internal_entity_id: null,
		window_start_at: NOW - HOUR,
		window_end_at: NOW + HOUR,
		anchor_customer_entitlement_id: "ce_old",
		...overrides,
	}) as UsageWindowLimit;

describe("computeUsageWindowRolls", () => {
	test("live row matching its limit's derivation: no roll", () => {
		const rolls = computeUsageWindowRolls({
			usageWindows: [row({})],
			limits: [limit({})],
			now: NOW,
		});
		expect(rolls).toHaveLength(0);
	});

	test("plan change (bounds moved, not expired): re-bound, count zeroed", () => {
		const rolls = computeUsageWindowRolls({
			usageWindows: [row({})],
			limits: [
				limit({
					window_start_at: NOW - 2 * HOUR,
					window_end_at: NOW + 5 * HOUR,
					anchor_customer_entitlement_id: "ce_new",
				}),
			],
			now: NOW,
		});
		expect(rolls).toHaveLength(1);
		expect(rolls[0]).toMatchObject({
			id: "uw_1",
			zero_usage: true,
			window_start_at: NOW - 2 * HOUR,
			window_end_at: NOW + 5 * HOUR,
			anchor_customer_entitlement_id: "ce_new",
		});
	});

	test("anchor-only re-point (same window, ent recreated): count kept", () => {
		const rolls = computeUsageWindowRolls({
			usageWindows: [row({})],
			limits: [limit({ anchor_customer_entitlement_id: "ce_recreated" })],
			now: NOW,
		});
		expect(rolls).toHaveLength(1);
		expect(rolls[0]).toMatchObject({
			zero_usage: false,
			window_start_at: NOW - HOUR,
			window_end_at: NOW + HOUR,
			anchor_customer_entitlement_id: "ce_recreated",
		});
	});

	test("expired row: re-bound to the current derivation, count zeroed", () => {
		const rolls = computeUsageWindowRolls({
			usageWindows: [
				row({ window_start_at: NOW - 3 * HOUR, window_end_at: NOW - HOUR }),
			],
			limits: [limit({})],
			now: NOW,
		});
		expect(rolls).toHaveLength(1);
		expect(rolls[0]).toMatchObject({
			zero_usage: true,
			window_start_at: NOW - HOUR,
			window_end_at: NOW + HOUR,
		});
	});

	test("expired row with no resolvable limit (entity scope, v1): zero-only, bounds kept", () => {
		const rolls = computeUsageWindowRolls({
			usageWindows: [
				row({
					internal_entity_id: "ient_1",
					window_start_at: NOW - 3 * HOUR,
					window_end_at: NOW - HOUR,
				}),
			],
			limits: [limit({})], // customer-scope limit doesn't match the entity row
			now: NOW,
		});
		expect(rolls).toHaveLength(1);
		expect(rolls[0]).toMatchObject({
			zero_usage: true,
			internal_entity_id: "ient_1",
			window_start_at: NOW - 3 * HOUR,
			window_end_at: NOW - HOUR,
			anchor_customer_entitlement_id: "ce_old",
		});
	});
});
