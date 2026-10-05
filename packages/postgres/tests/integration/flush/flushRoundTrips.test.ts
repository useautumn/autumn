import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPostgresClient } from "../../../src/createPostgresClient.js";
import {
	commitFlush,
	type FlushRoundTrips,
} from "../../../src/flush/repos/commitFlush.js";
import type { FlushRequest } from "../../../src/flush/types/flush.js";
import type { PostgresClient } from "../../../src/types/postgresClient.js";

/** A disposable Postgres (each run drops and recreates its own tables); skipped without one. */
const databaseUrl = process.env.FLUSH_TEST_DATABASE_URL;

const SCHEMA = `
	DROP TABLE IF EXISTS customer_entitlements, partition_progress, pooled_balance_contributions;
	CREATE TABLE customer_entitlements (
		id text PRIMARY KEY,
		balance numeric NOT NULL DEFAULT 0,
		usage_attribution jsonb NOT NULL DEFAULT '{}',
		entities jsonb,
		entitlement_id text NOT NULL DEFAULT 'ent',
		internal_customer_id text NOT NULL DEFAULT 'cus',
		internal_feature_id text NOT NULL DEFAULT 'feat',
		created_at numeric NOT NULL DEFAULT 0
	);
	CREATE TABLE partition_progress (
		topic text NOT NULL,
		partition_id integer NOT NULL,
		next_offset bigint NOT NULL,
		command_next_offset bigint,
		owner_epoch bigint,
		owner_fence_offset bigint,
		claim_token text,
		PRIMARY KEY (topic, partition_id)
	);
	CREATE TABLE pooled_balance_contributions (
		id text PRIMARY KEY,
		pooled_balance_id text NOT NULL,
		current_contribution numeric NOT NULL DEFAULT 0,
		next_cycle_contribution numeric NOT NULL DEFAULT 0,
		effective_at numeric,
		updated_at numeric
	);`;

const SEED = `
	TRUNCATE customer_entitlements, partition_progress, pooled_balance_contributions;
	INSERT INTO customer_entitlements (id, balance, entities) VALUES
		('ce_1', 100, '{"e1":{"id":"e1","balance":10,"adjustment":0}}'),
		('ce_2', 50, NULL);
	INSERT INTO partition_progress (topic, partition_id, next_offset, claim_token) VALUES
		('metering', 3, 40, 'claim-3'),
		('metering', 7, 9, NULL);
	INSERT INTO pooled_balance_contributions (id, pooled_balance_id, current_contribution, next_cycle_contribution, effective_at) VALUES
		('pc_1', 'pb_1', 5, 8, 1000);`;

const increment = ({ id, delta }: { id: string; delta: number }) =>
	({
		op: "update",
		table: "customerEntitlements",
		id,
		set: {},
		add: { balance: delta },
		addEntries: {},
		guard: {},
	}) as const;

const bookmarks = ({ stale = false, claim = "claim-3" } = {}) => [
	{
		topic: "metering",
		partition: 3,
		expectedOffset: stale ? 39n : 40n,
		nextOffset: 42n,
		claimToken: claim,
		ownerFence: { epoch: 2n, offset: 41n },
	},
	{
		topic: "metering",
		partition: 7,
		expectedOffset: 9n,
		nextOffset: 10n,
		commandNextOffset: 12n,
	},
];

const CONFLICT = { error: "FlushBookmarkConflictError", sqlState: null };

type Scenario = { request: FlushRequest; landed: boolean; outcome: unknown };

const SCENARIOS: Record<string, Scenario> = {
	"lands every change and both bookmarks": {
		landed: true,
		outcome: { result: { applied: [true, true, true, true, true] } },
		request: {
			changes: [
				increment({ id: "ce_1", delta: -5 }),
				increment({ id: "ce_2", delta: 3 }),
				{
					op: "update",
					table: "customerEntitlements",
					id: "ce_1",
					set: {},
					add: {},
					addEntries: { entities: { e1: { balance: -2 }, e2: { balance: 4 } } },
					guard: {},
				},
				{
					op: "insert",
					table: "customerEntitlements",
					row: { id: "ce_3", balance: 7 },
				},
				{
					op: "promote",
					table: "pooledContributions",
					pooledBalanceId: "pb_1",
					dueBy: 2000,
				},
			],
			bookmarks: bookmarks(),
		},
	},
	"a stale bookmark conflicts and nothing lands": {
		landed: false,
		outcome: CONFLICT,
		request: {
			changes: [increment({ id: "ce_1", delta: -5 })],
			bookmarks: bookmarks({ stale: true }),
		},
	},
	"another writer's claim conflicts and nothing lands": {
		landed: false,
		outcome: CONFLICT,
		request: {
			changes: [increment({ id: "ce_1", delta: -5 })],
			bookmarks: bookmarks({ claim: "claim-other" }),
		},
	},
	"a missing row rolls back the whole flush and names itself": {
		landed: false,
		outcome: { result: { applied: [true, false] } },
		request: {
			changes: [
				increment({ id: "ce_1", delta: -5 }),
				increment({ id: "ce_gone", delta: -1 }),
			],
			bookmarks: bookmarks(),
		},
	},
	"a guard that no longer matches rolls back the whole flush": {
		landed: false,
		outcome: { result: { applied: [true, false] } },
		request: {
			changes: [
				increment({ id: "ce_2", delta: 1 }),
				{
					op: "update",
					table: "customerEntitlements",
					id: "ce_1",
					set: { balance: 90 },
					add: {},
					addEntries: {},
					guard: { balance: 99 },
				},
			],
			bookmarks: bookmarks(),
		},
	},
	"a stale bookmark wins over a missing row": {
		landed: false,
		outcome: CONFLICT,
		request: {
			changes: [increment({ id: "ce_gone", delta: -1 })],
			bookmarks: bookmarks({ stale: true }),
		},
	},
	"a duplicate insert fails with Postgres's error and nothing lands": {
		landed: false,
		outcome: { error: "PostgresError", sqlState: "23505" },
		request: {
			changes: [
				increment({ id: "ce_1", delta: -5 }),
				{
					op: "insert",
					table: "customerEntitlements",
					row: { id: "ce_2", balance: 1 },
				},
			],
			bookmarks: bookmarks(),
		},
	},
	"a promote with nothing due still lands": {
		landed: true,
		outcome: { result: { applied: [true] } },
		request: {
			changes: [
				{
					op: "promote",
					table: "pooledContributions",
					pooledBalanceId: "pb_1",
					dueBy: 10,
				},
			],
			bookmarks: bookmarks(),
		},
	},
};

describe.skipIf(!databaseUrl)(
	"commitFlush: one statement lands exactly what the transaction lands",
	() => {
		let postgres: PostgresClient;

		beforeAll(async () => {
			postgres = createPostgresClient({
				config: {
					databaseUrl: databaseUrl as string,
					maxConnections: 2,
					connectTimeout: 10,
					idleTimeout: 30,
				},
			});
			await postgres.client.unsafe(SCHEMA);
		});

		afterAll(async () => {
			await postgres?.close();
		});

		const snapshot = async () => ({
			entitlements: await postgres.client.unsafe(
				"SELECT id, balance::text, usage_attribution, entities FROM customer_entitlements ORDER BY id",
			),
			progress: await postgres.client.unsafe(
				"SELECT topic, partition_id, next_offset::text, command_next_offset::text, owner_epoch::text, owner_fence_offset::text, claim_token FROM partition_progress ORDER BY topic, partition_id",
			),
			contributions: await postgres.client.unsafe(
				"SELECT id, current_contribution::text, effective_at::text FROM pooled_balance_contributions ORDER BY id",
			),
		});

		const runArm = async ({
			request,
			roundTrips,
		}: {
			request: FlushRequest;
			roundTrips: FlushRoundTrips;
		}) => {
			await postgres.client.unsafe(SEED);
			const before = await snapshot();
			let outcome: unknown;
			try {
				outcome = {
					result: await commitFlush({
						ctx: { db: postgres.db },
						request,
						statementTimeoutMs: 2_000,
						roundTrips,
					}),
				};
			} catch (error) {
				const { name, errno } = error as Error & { errno?: string };
				outcome = { error: name, sqlState: errno ?? null };
			}
			return { outcome, before, after: await snapshot() };
		};

		for (const [name, { request, landed, outcome }] of Object.entries(
			SCENARIOS,
		)) {
			test(name, async () => {
				const transaction = await runArm({
					request,
					roundTrips: "transaction",
				});
				const single = await runArm({ request, roundTrips: "single" });
				expect(single.outcome).toEqual(transaction.outcome);
				expect(single.after).toEqual(transaction.after);
				expect(transaction.outcome).toEqual(outcome);
				if (landed) expect(transaction.after).not.toEqual(transaction.before);
				else expect(transaction.after).toEqual(transaction.before);
			});
		}
	},
);
