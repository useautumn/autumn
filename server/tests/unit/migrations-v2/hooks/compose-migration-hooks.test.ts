import { describe, expect, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";
import {
	type AroundMigrateCustomerArgs,
	buildSkippedMigrateCustomerResult,
	composeMigrationHooks,
	customerGuardPlugin,
} from "@/internal/migrations/v2/hooks/index.js";
import type { MigrateCustomerResult } from "@/internal/migrations/v2/run/migrateCustomer/index.js";

const fullCustomer = {
	id: "customer_1",
	internal_id: "internal_customer_1",
	name: "Test Customer",
	email: "test@example.com",
} as unknown as FullCustomer;

const baseResult: MigrateCustomerResult = {
	itemPreview: {
		id: "customer_1",
		name: "Test Customer",
		email: "test@example.com",
	},
	status: "succeeded",
	response: { preview: { ok: true } },
};

const args = {
	customerId: "customer_1",
	context: { fullCustomer },
	preview: true,
	run: async () => baseResult,
} as unknown as AroundMigrateCustomerArgs;

describe("migration hooks", () => {
	test("runs plugin around hooks before direct hooks and can return early", async () => {
		const calls: string[] = [];
		const hooks = composeMigrationHooks({
			plugins: [
				{
					id: "skip-plugin",
					hooks: {
						aroundMigrateCustomer: ({ context }) => {
							calls.push("plugin");
							return buildSkippedMigrateCustomerResult({
								context,
								skip: { reason: "manual_review" },
							});
						},
					},
				},
			],
			hooks: {
				aroundMigrateCustomer: ({ run }) => {
					calls.push("direct");
					return run();
				},
			},
		});

		await expect(hooks?.aroundMigrateCustomer?.(args)).resolves.toMatchObject({
			status: "skipped",
			response: {
				skipped: {
					reason: "manual_review",
				},
			},
		});
		expect(calls).toEqual(["plugin"]);
	});

	test("wraps around hooks in plugin order then direct hooks", async () => {
		const calls: string[] = [];
		const hooks = composeMigrationHooks({
			plugins: [
				{
					id: "first",
					hooks: {
						aroundMigrateCustomer: async ({ run }) => {
							calls.push("first:before");
							const result = await run();
							calls.push("first:after");
							return {
								...result,
								response: { ...(result.response ?? {}), first: true },
							};
						},
					},
				},
			],
			hooks: {
				aroundMigrateCustomer: async ({ run }) => {
					calls.push("direct:before");
					const result = await run();
					calls.push("direct:after");
					return {
						...result,
						response: { ...(result.response ?? {}), second: true },
					};
				},
			},
		});

		await expect(
			hooks?.aroundMigrateCustomer?.({
				...args,
				run: async () => {
					calls.push("base");
					return baseResult;
				},
			}),
		).resolves.toMatchObject({
			response: {
				first: true,
				second: true,
			},
		});
		expect(calls).toEqual([
			"first:before",
			"direct:before",
			"base",
			"direct:after",
			"first:after",
		]);
	});

	test("customerGuardPlugin converts a guard hit into a skipped hook result", async () => {
		const plugin = customerGuardPlugin({
			id: "custom-guard",
			guard: () => ({
				reason: "custom_condition",
				response: { guardReasons: ["needs_manual_review"] },
			}),
		});

		await expect(
			plugin.hooks?.aroundMigrateCustomer?.(args),
		).resolves.toMatchObject({
			status: "skipped",
			response: {
				guard: {
					pluginId: "custom-guard",
					reason: "custom_condition",
					guardReasons: ["needs_manual_review"],
				},
			},
		});
	});
});
