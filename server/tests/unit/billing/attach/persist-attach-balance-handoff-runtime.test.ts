import { describe, expect, test } from "bun:test";
import type { NormalizedFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { persistAttachBalanceHandoffRuntime } from "@/internal/billing/v2/execute/attachBalanceHandoff/persistAttachBalanceHandoffRuntime.js";

const subject = ({
	id,
	cacheVersion,
	usageWindows = [],
}: {
	id: string;
	cacheVersion: number;
	usageWindows?: Record<string, unknown>[];
}) =>
	({
		customer_entitlements: [
			{
				id,
				balance: 90,
				additional_balance: 7,
				adjustment: -3,
				entities: null,
				cache_version: cacheVersion,
				rollovers: [],
			},
		],
		usage_windows: usageWindows,
	}) as unknown as NormalizedFullSubject;

const contextWithUpdateResult = ({
	rows,
	updates,
	usageWindowWrites,
}: {
	rows: { id: string }[];
	updates?: Record<string, unknown>[];
	usageWindowWrites?: Record<string, unknown>[][];
}) =>
	({
		db: {
			transaction: async (callback: (transaction: unknown) => Promise<void>) =>
				callback({
					update: () => ({
						set: (values: Record<string, unknown>) => {
							updates?.push(values);
							return {
								where: () => ({ returning: async () => rows }),
							};
						},
					}),
					insert: () => ({
						values: (values: Record<string, unknown>[]) => {
							usageWindowWrites?.push(values);
							return { onConflictDoUpdate: async () => undefined };
						},
					}),
				}),
		},
	}) as unknown as AutumnContext;

describe("persistAttachBalanceHandoffRuntime", () => {
	test("rejects the handoff when a balance row moved past its allowed versions", async () => {
		const normalized = subject({ id: "balance_1", cacheVersion: 8 });

		await expect(
			persistAttachBalanceHandoffRuntime({
				ctx: contextWithUpdateResult({ rows: [] }),
				source: normalized,
				target: normalized,
				allowedCacheVersionsById: new Map([["balance_1", [7, 8]]]),
			}),
		).rejects.toThrow("changed during attach handoff");
	});

	test("accepts the one row protected by the version predicate", async () => {
		const normalized = subject({ id: "balance_1", cacheVersion: 8 });
		const updates: Record<string, unknown>[] = [];

		await expect(
			persistAttachBalanceHandoffRuntime({
				ctx: contextWithUpdateResult({
					rows: [{ id: "balance_1" }],
					updates,
				}),
				source: normalized,
				target: normalized,
				allowedCacheVersionsById: new Map([["balance_1", [7, 8]]]),
			}),
		).resolves.toBeUndefined();
		expect(updates[0]).toMatchObject({
			balance: 90,
			additional_balance: 7,
			adjustment: -3,
		});
	});

	test("persists a live source usage window even when B no longer contains it", async () => {
		const sourceWindow = {
			id: "window_a",
			feature_id: "messages",
			usage: 5,
		};
		const source = subject({
			id: "balance_1",
			cacheVersion: 8,
			usageWindows: [sourceWindow],
		});
		const target = subject({ id: "balance_1", cacheVersion: 8 });
		const usageWindowWrites: Record<string, unknown>[][] = [];

		await persistAttachBalanceHandoffRuntime({
			ctx: contextWithUpdateResult({
				rows: [{ id: "balance_1" }],
				usageWindowWrites,
			}),
			source,
			target,
			allowedCacheVersionsById: new Map([["balance_1", [7, 8]]]),
		});

		expect(usageWindowWrites).toEqual([[sourceWindow]]);
	});
});
