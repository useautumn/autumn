import { describe, expect, test } from "bun:test";
import type { NormalizedFullSubject, SubjectBalance } from "@autumn/shared";
import { fenceAttachBalanceHandoffCacheVersions } from "@/internal/billing/v2/execute/attachBalanceHandoff/fenceAttachBalanceHandoffCacheVersions.js";

const subject = ({
	balances,
	usageWindows = [],
}: {
	balances: Pick<SubjectBalance, "id" | "cache_version">[];
	usageWindows?: { id: string; updated_at: number }[];
}): NormalizedFullSubject =>
	({
		customer_entitlements: balances,
		usage_windows: usageWindows,
	}) as unknown as NormalizedFullSubject;

describe("fenceAttachBalanceHandoffCacheVersions", () => {
	test("advances every A and B entitlement from the highest existing version", () => {
		const source = subject({
			balances: [
				{ id: "source_only", cache_version: 7 },
				{ id: "unchanged", cache_version: 2 },
			],
		});
		const target = subject({
			balances: [
				{ id: "target_only", cache_version: 0 },
				{ id: "unchanged", cache_version: 4 },
			],
		});

		const fenced = fenceAttachBalanceHandoffCacheVersions({ source, target });

		expect(
			Object.fromEntries(
				fenced.source.customer_entitlements.map((balance) => [
					balance.id,
					balance.cache_version,
				]),
			),
		).toEqual({ source_only: 8, unchanged: 5 });
		expect(
			Object.fromEntries(
				fenced.target.customer_entitlements.map((balance) => [
					balance.id,
					balance.cache_version,
				]),
			),
		).toEqual({ target_only: 1, unchanged: 5 });
		expect(fenced.allowedCacheVersionsById).toEqual(
			new Map([
				["source_only", [7, 8]],
				["target_only", [0, 1]],
				["unchanged", [2, 4, 5]],
			]),
		);
		expect(source.customer_entitlements[0]?.cache_version).toBe(7);
		expect(target.customer_entitlements[0]?.cache_version).toBe(0);
	});

	test("makes the persisted usage-window snapshot newer than queued A work", () => {
		const source = subject({
			balances: [],
			usageWindows: [{ id: "window_1", updated_at: 10 }],
		});
		const target = subject({
			balances: [],
			usageWindows: [{ id: "window_1", updated_at: 10 }],
		});

		const fenced = fenceAttachBalanceHandoffCacheVersions({ source, target });

		expect(fenced.source.usage_windows[0]?.updated_at).toBe(11);
		expect(fenced.target.usage_windows[0]?.updated_at).toBe(11);
	});
});
