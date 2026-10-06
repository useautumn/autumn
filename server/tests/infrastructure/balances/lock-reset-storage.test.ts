/**
 * Real storage regression for #4069. No Autumn/Stripe credentials required.
 * Prerequisites: redis-server, initdb and pg_ctl on PATH (run as a non-root user).
 * UNIT_TESTS=1 bun test tests/infrastructure/balances/lock-reset-storage.test.ts
 * Each run owns disposable Unix-socket-only Redis/Postgres instances.
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { customerEntitlements, replaceables, rollovers } from "@autumn/shared";
import { getTableConfig } from "drizzle-orm/pg-core";
import Redis from "ioredis";
import postgres from "postgres";
import {
	DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT,
	UPDATE_SUBJECT_BALANCES_SCRIPT,
} from "@/_luaScriptsV2/luaScriptsV2.js";

const resetAt = Date.UTC(2026, 9, 1);
const nextResetAt = Date.UTC(2026, 10, 1);
const deduction = {
	customer_entitlement_id: "ce",
	feature_id: "messages",
	credit_cost: 1,
	usage_allowed: false,
	unlimited: false,
	min_balance: 0,
	max_balance: 1000,
};
const params = {
	org_id: "test",
	env: "sandbox",
	customer_id: "cus",
	feature_id: "messages",
	customer_entitlement_deductions: [deduction],
	balance_key_index_by_feature_id: { messages: 5 },
	cus_ent_ids: ["ce"],
	overage_behaviour: "reject",
	skip_additional_balance: true,
	is_consumption: true,
};
let directory: string;
let redisProcess: ReturnType<typeof Bun.spawn> | undefined;
let redis: Redis | undefined;
let db: ReturnType<typeof postgres> | undefined;
let postgresStarted = false;

const run = (args: string[]) => {
	const result = Bun.spawnSync(args, { stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0)
		throw new Error(`${args[0]}: ${result.stderr.toString()}`);
};

beforeAll(async () => {
	for (const binary of ["redis-server", "initdb", "pg_ctl"]) {
		if (!Bun.which(binary))
			throw new Error(`This storage test requires ${binary} on PATH`);
	}
	directory = await mkdtemp(join(tmpdir(), "autumn-lock-"));
	// macOS's default tmpdir can exceed the Unix socket path limit.
	if (directory.length > 65) {
		await rm(directory, { recursive: true });
		directory = await mkdtemp("/tmp/autumn-lock-");
	}
	run([
		"initdb",
		"-D",
		join(directory, "data"),
		"-A",
		"trust",
		"--no-locale",
		"-U",
		"autumn_test",
	]);
	run([
		"pg_ctl",
		"-D",
		join(directory, "data"),
		"-l",
		join(directory, "postgres.log"),
		"-o",
		`-h '' -k ${directory}`,
		"-w",
		"start",
	]);
	postgresStarted = true;
	db = postgres({
		host: directory,
		database: "postgres",
		username: "autumn_test",
		max: 2,
		onnotice: () => {},
	});
	redisProcess = Bun.spawn(
		[
			"redis-server",
			"--port",
			"0",
			"--unixsocket",
			join(directory, "redis.sock"),
			"--save",
			"",
			"--appendonly",
			"no",
		],
		{ stdout: "ignore", stderr: "ignore" },
	);
	redis = new Redis({
		path: join(directory, "redis.sock"),
		retryStrategy: (attempt) => (attempt < 100 ? 20 : null),
	});
	redis.on("error", () => {});
	await redis.ping();
	// Use the repository's column definitions; unrelated foreign keys are not
	// needed to exercise deduction/reset functions against isolated balance rows.
	for (const table of [customerEntitlements, rollovers, replaceables]) {
		const config = getTableConfig(table);
		const columns = config.columns.filter(
			(column) => column.name !== "balance_reset_at",
		);
		await db.unsafe(
			`CREATE TABLE "${config.name}" (${columns.map((column) => `"${column.name}" ${column.getSQLType()}`).join(", ")})`,
		);
	}
	await db.unsafe(
		await readFile(
			new URL(
				"../../../../shared/drizzle/0095_lock_balance_reset_period.sql",
				import.meta.url,
			),
			"utf8",
		),
	);
	for (const file of [
		"deductFromMainBalance",
		"creditRateUtils",
		"deductFromRollovers",
		"unwindFromLockReceipt",
		"getTotalBalance",
		"deductFromAdditionalBalance",
		"getAvailableOverageFromSpendLimit",
		"performDeduction",
		"resetCusEnts",
		"syncBalancesV2",
	]) {
		await db.unsafe(
			await readFile(
				new URL(
					`../../../src/internal/balances/utils/sql/${file}.sql`,
					import.meta.url,
				),
				"utf8",
			),
		);
	}
}, 30_000);

afterAll(async () => {
	redis?.disconnect();
	redisProcess?.kill();
	if (redisProcess) await redisProcess.exited;
	await db?.end();
	if (postgresStarted)
		run(["pg_ctl", "-D", join(directory, "data"), "-m", "fast", "-w", "stop"]);
	if (directory) await rm(directory, { recursive: true, force: true });
});

const storage = () => {
	if (!redis || !db) throw new Error("Storage fixture not started");
	return { redis, db };
};
const deductRedis = async (extra: object, lockKey = "") => {
	const { redis } = storage();
	const result = JSON.parse(
		(await redis.eval(
			DEDUCT_FROM_SUBJECT_BALANCES_SCRIPT,
			5,
			"balance",
			lockKey,
			"",
			"epoch",
			"balance",
			JSON.stringify({ ...params, ...extra }),
		)) as string,
	);
	expect(result.error ?? null).toBeNull();
	return result;
};
const deductPostgres = async (extra: object) => {
	const { db } = storage();
	const [row] =
		await db`SELECT deduct_from_cus_ents(${db.json({ ...params, sorted_entitlements: [deduction], ...extra })}::jsonb) AS result`;
	return row.result;
};

const scenarios = [
	"same-cycle",
	"schedule-only",
	"reset",
	"reset-new-usage",
	"negative-reset",
	"legacy",
] as const;
for (const backend of ["redis", "postgres"] as const) {
	test.each([...scenarios])(
		`${backend}: %s preserves the correct period balance`,
		async (scenario) => {
			const { redis, db } = storage();
			await redis.del("balance", "receipt");
			await redis.hset(
				"balance",
				"ce",
				JSON.stringify({
					id: "ce",
					customer_product_id: "cp",
					balance: 1000,
					adjustment: 0,
					additional_balance: 0,
					entities: null,
					usage_attribution: {},
					next_reset_at: resetAt,
					rollovers: [],
				}),
			);
			await db`DELETE FROM customer_entitlements`;
			await db`INSERT INTO customer_entitlements(id, balance, next_reset_at, additional_balance, adjustment, entities, usage_attribution, cache_version) VALUES ('ce', 1000, ${resetAt}, 0, 0, '{}', '{}', 0)`;
			const amount = scenario === "negative-reset" ? -600 : 600;
			const locked =
				backend === "redis"
					? await deductRedis(
							{
								amount_to_deduct: amount,
								overage_behaviour: "overflow",
								lock: { enabled: true },
							},
							"receipt",
						)
					: await deductPostgres({
							amount_to_deduct: amount,
							overage_behaviour: "overflow",
						});
			const receipt =
				backend === "redis"
					? JSON.parse((await redis.get("receipt")) ?? "null")
					: { items: locked.mutation_logs };
			expect(receipt.items[0].balance_reset_at).toBe(0);
			if (scenario === "legacy") delete receipt.items[0].balance_reset_at;
			const resets = scenario.includes("reset");
			if (resets || scenario === "schedule-only") {
				if (backend === "redis") {
					await redis.eval(
						UPDATE_SUBJECT_BALANCES_SCRIPT,
						1,
						"balance",
						JSON.stringify({
							ttl_seconds: 3600,
							updates: [
								{
									cus_ent_id: "ce",
									next_reset_at: nextResetAt,
									...(resets
										? {
												balance: 1000,
												adjustment: 0,
												balance_reset_at: resetAt,
												usage_attribution: {},
											}
										: {}),
								},
							],
						}),
					);
				} else if (resets) {
					await db`SELECT reset_customer_entitlements(${db.json({ resets: [{ cus_ent_id: "ce", balance: 1000, adjustment: 0, next_reset_at: nextResetAt, balance_reset_at: resetAt, usage_attribution: {} }] })}::jsonb)`;
				} else
					await db`UPDATE customer_entitlements SET next_reset_at = ${nextResetAt}`;
			}
			if (scenario === "reset-new-usage") {
				if (backend === "redis") await deductRedis({ amount_to_deduct: 100 });
				else await deductPostgres({ amount_to_deduct: 100 });
			}
			if (backend === "redis") {
				await redis.set("receipt", JSON.stringify(receipt));
				await deductRedis(
					{ amount_to_deduct: 0, unwind_value: 580 },
					"receipt",
				);
			} else
				await deductPostgres({
					amount_to_deduct: 0,
					unwind_value: 580,
					lock_receipt: receipt,
				});
			const cached = await redis.hget("balance", "ce");
			if (!cached) throw new Error("Expected cached balance");
			const actual =
				backend === "redis"
					? JSON.parse(cached).balance
					: Number(
							(
								await db`SELECT balance FROM customer_entitlements WHERE id = 'ce'`
							)[0].balance,
						);
			expect(actual).toBe(
				scenario === "reset-new-usage" ? 900 : resets ? 1000 : 980,
			);
		},
	);
}

test("Postgres refuses a stale cache flush even when a refill keeps next_reset_at", async () => {
	const { db } = storage();
	await db`DELETE FROM customer_entitlements`;
	await db`INSERT INTO customer_entitlements(id, balance, next_reset_at, balance_reset_at, cache_version) VALUES ('ce', 900, ${nextResetAt}, ${resetAt}, 0)`;
	await expect(
		Promise.resolve(
			db`SELECT sync_balances_v2(${db.json({ customer_entitlement_updates: [{ customer_entitlement_id: "ce", balance: 1480, next_reset_at: nextResetAt, balance_reset_at: null, entity_count: 0, cache_version: 0 }] })}::jsonb)`,
		),
	).rejects.toThrow("RESET_AT_MISMATCH");
	expect(
		Number(
			(await db`SELECT balance FROM customer_entitlements WHERE id = 'ce'`)[0]
				.balance,
		),
	).toBe(900);
});
