import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createPostgresClient } from "../../../src/createPostgresClient.js";
import {
	commitFlush,
	type FlushRoundTrips,
} from "../../../src/flush/repos/commitFlush.js";
import type { FlushRequest } from "../../../src/flush/types/flush.js";
import type { SubjectRowChange } from "../../../src/subjects/types/subjectRowChange.js";
import type { PostgresClient } from "../../../src/types/postgresClient.js";

/**
 * Fuzz equivalence: the single round-trip flush must land exactly the rows, and answer exactly the outcome, the
 * four-round-trip transaction does, for random requests carrying adversarial strings and numbers across every range.
 * Run with FLUSH_TEST_DATABASE_URL=postgres://... FLUSH_FUZZ_CASES=300 FLUSH_FUZZ_SEED=1
 */
const databaseUrl = process.env.FLUSH_TEST_DATABASE_URL;
const CASES = Number(process.env.FLUSH_FUZZ_CASES ?? 300);
const SEED = Number(process.env.FLUSH_FUZZ_SEED ?? 1);

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

const SEED_SQL = `
	TRUNCATE customer_entitlements, partition_progress, pooled_balance_contributions;
	INSERT INTO customer_entitlements (id, balance, entities) VALUES
		('ce_1', 100, '{"e1":{"id":"e1","balance":10,"adjustment":0}}'),
		('ce_2', 50, NULL),
		('ce_o''q\\$1', 7, NULL);
	INSERT INTO partition_progress (topic, partition_id, next_offset, claim_token) VALUES
		('metering', 3, 40, 'claim-3'),
		('metering', 7, 9, NULL);
	INSERT INTO pooled_balance_contributions (id, pooled_balance_id, current_contribution, next_cycle_contribution, effective_at) VALUES
		('pc_1', 'pb_1', 5, 8, 1000);`;

/** mulberry32: a seeded PRNG so any divergence replays from its case number. */
const prng = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const ADVERSARIAL_STRINGS = [
	"plain",
	"it's",
	"\\",
	"\\'",
	"\\'; DROP TABLE customer_entitlements; --",
	"E'\\\\''",
	"'; SELECT 1; --",
	"$1",
	"$2::text",
	"$$x$$",
	'"quoted"',
	"é😀",
	"\ud800",
	"a\ud800b\udc00",
	"\u2028\u2029",
	"a\u0007b\u001bc",
	"\\x41\\n\\t",
	"--",
	"/* */",
	";",
	"flush_rolled_back:",
	"flush_rolled_back:0123456789abcdef0123456789abcdef:1:1",
	'invalid input syntax for type integer: "x"',
	"",
	" ",
	"\\\\''",
	"'''",
	"\\u0041",
	"NULL",
	"null",
	"true",
];

/**
 * Bun binds an integer in [2^51, 2^53] as float8 (15 significant digits into numeric) while the inliner emits an exact
 * int8: a known divergence where the single path is the precise one. Set FLUSH_FUZZ_BIG_INTS=1 to include that band.
 */
const includeBigInts = process.env.FLUSH_FUZZ_BIG_INTS === "1";
const NUMBERS = [
	0,
	-0,
	1,
	-1,
	5,
	-5,
	0.5,
	-2.5,
	0.1 + 0.2,
	1e-7,
	5e-324,
	1e21,
	1e300,
	123456.789,
	2 ** 31 - 1,
	2 ** 31,
	-(2 ** 31),
	-(2 ** 31) - 1,
	2 ** 40,
	2 ** 51 - 1,
	2 ** 51,
	2 ** 52 + 1,
	2 ** 53 - 1,
	2 ** 53,
	2 ** 53 + 2,
	Date.now(),
	-123456789.5,
].filter(
	(n) => includeBigInts || !Number.isInteger(n) || Math.abs(n) < 2 ** 51,
);

const fuzzRequest = (random: () => number): FlushRequest => {
	const pick = <T>(items: readonly T[]): T =>
		items[Math.floor(random() * items.length)] as T;
	const chance = (p: number) => random() < p;
	const randomString = () =>
		chance(0.7)
			? pick(ADVERSARIAL_STRINGS)
			: Array.from({ length: Math.floor(random() * 6) }, () =>
					pick(ADVERSARIAL_STRINGS),
				).join("");
	const randomNumber = () =>
		chance(0.6) ? pick(NUMBERS) : Math.floor(random() * 2e6) - 1e6;
	const existingId = () => pick(["ce_1", "ce_2", "ce_o'q\\$1", "ce_gone"]);
	const changes: SubjectRowChange[] = [];
	const count = 1 + Math.floor(random() * 5);
	const insertedIds = new Set<string>();
	for (let i = 0; i < count; i++) {
		const kind = random();
		if (kind < 0.35) {
			const guard: Record<string, unknown> = {};
			if (chance(0.25)) guard.balance = chance(0.5) ? 100 : randomNumber();
			if (chance(0.1))
				guard.entitlement_id = chance(0.5) ? "ent" : randomString();
			if (chance(0.1))
				guard.entities = chance(0.5)
					? null
					: { e1: { id: "e1", balance: 10, adjustment: 0 } };
			const set: Record<string, unknown> = {};
			if (chance(0.3)) set.entitlement_id = randomString();
			if (chance(0.2)) set.balance = randomNumber();
			if (chance(0.15))
				set.usage_attribution = { note: randomString(), n: randomNumber() };
			const add: Record<string, number> = {};
			if (!("balance" in set) || chance(0.3)) add.balance = randomNumber();
			if (chance(0.2)) add.created_at = randomNumber();
			const addEntries: Record<
				string,
				Record<string, Record<string, number>>
			> = {};
			if (chance(0.3))
				addEntries.entities = {
					[chance(0.5) ? "e1" : randomString()]: { balance: randomNumber() },
				};
			if (chance(0.2))
				addEntries.usage_attribution = {
					[randomString()]: {
						units: chance(0.3) ? 0 : randomNumber(),
						credits: 0,
					},
				};
			if (
				Object.keys(set).length +
					Object.keys(add).length +
					Object.keys(addEntries).length ===
				0
			)
				add.balance = 1;
			changes.push({
				op: "update",
				table: "customerEntitlements",
				id: existingId(),
				set,
				add,
				addEntries,
				guard,
			});
		} else if (kind < 0.6) {
			const id = chance(0.15) ? existingId() : `new_${randomString()}_${i}`;
			if (insertedIds.has(id)) continue;
			insertedIds.add(id);
			const row: Record<string, unknown> = { id };
			if (chance(0.7)) row.balance = randomNumber();
			if (chance(0.4)) row.entitlement_id = randomString();
			if (chance(0.4))
				row.usage_attribution = { note: randomString(), n: randomNumber() };
			if (chance(0.3))
				row.entities = chance(0.3)
					? null
					: { [randomString()]: { balance: randomNumber() } };
			if (chance(0.3)) row.created_at = randomNumber();
			changes.push({ op: "insert", table: "customerEntitlements", row });
		} else if (kind < 0.75) {
			changes.push({
				op: "delete",
				table: "customerEntitlements",
				id: existingId(),
			});
		} else {
			changes.push({
				op: "promote",
				table: "pooledContributions",
				pooledBalanceId: chance(0.7) ? "pb_1" : randomString(),
				dueBy: chance(0.6) ? 2000 : randomNumber(),
			});
		}
	}
	if (changes.length === 0)
		changes.push({
			op: "promote",
			table: "pooledContributions",
			pooledBalanceId: "pb_1",
			dueBy: 2000,
		});
	const bookmarks = [
		{
			topic: "metering",
			partition: 3,
			expectedOffset: chance(0.15) ? 39n : 40n,
			nextOffset: 42n,
			claimToken: chance(0.1)
				? randomString()
				: chance(0.8)
					? "claim-3"
					: undefined,
			ownerFence: chance(0.5) ? { epoch: 2n, offset: 41n } : undefined,
		},
		...(chance(0.6)
			? [
					{
						topic: "metering",
						partition: 7,
						expectedOffset: 9n,
						nextOffset: 10n + BigInt(Math.floor(random() * 5)),
						commandNextOffset: chance(0.5) ? 12n : undefined,
					},
				]
			: []),
	];
	return { changes, bookmarks };
};

describe.skipIf(!databaseUrl)(
	"commitFlush fuzz: single round trip ≡ transaction",
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
				"SELECT id, balance::text, usage_attribution, entities, entitlement_id, created_at::text FROM customer_entitlements ORDER BY id",
			),
			progress: await postgres.client.unsafe(
				"SELECT topic, partition_id, next_offset::text, command_next_offset::text, owner_epoch::text, owner_fence_offset::text, claim_token FROM partition_progress ORDER BY topic, partition_id",
			),
			contributions: await postgres.client.unsafe(
				"SELECT id, current_contribution::text, effective_at::text, updated_at::text FROM pooled_balance_contributions ORDER BY id",
			),
		});

		const runArm = async ({
			request,
			roundTrips,
		}: {
			request: FlushRequest;
			roundTrips: FlushRoundTrips;
		}) => {
			await postgres.client.unsafe(SEED_SQL);
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
				const { name, errno, message } = error as Error & { errno?: string };
				outcome = {
					error: name,
					sqlState: errno ?? null,
					message: errno ? undefined : message,
				};
			}
			return { outcome, after: await snapshot() };
		};

		test(`${CASES} random requests from seed ${SEED}`, async () => {
			const divergences: {
				index: number;
				request: FlushRequest;
				transaction: unknown;
				single: unknown;
			}[] = [];
			const outcomes = { landed: 0, conflict: 0, rolledBack: 0, pgError: 0 };
			for (let index = 0; index < CASES; index++) {
				const request = fuzzRequest(prng(SEED * 1_000_003 + index));
				const transaction = await runArm({
					request,
					roundTrips: "transaction",
				});
				const single = await runArm({ request, roundTrips: "single" });
				const o = transaction.outcome as {
					result?: { applied: boolean[] };
					error?: string;
				};
				if (o.result)
					outcomes[o.result.applied.every(Boolean) ? "landed" : "rolledBack"]++;
				else if (o.error === "FlushBookmarkConflictError") outcomes.conflict++;
				else outcomes.pgError++;
				if (
					JSON.stringify(single.outcome) !==
						JSON.stringify(transaction.outcome) ||
					JSON.stringify(single.after) !== JSON.stringify(transaction.after)
				)
					divergences.push({ index, request, transaction, single });
			}
			console.log("fuzz outcomes (transaction arm):", outcomes);
			if (divergences.length > 0)
				console.log(
					"DIVERGENCES:",
					JSON.stringify(
						divergences,
						(_k, v) => (typeof v === "bigint" ? `${v}n` : v),
						2,
					).slice(0, 20_000),
				);
			expect(divergences).toEqual([]);
		}, 600_000);

		test("an injection-shaped id round-trips byte-identical through the single statement", async () => {
			const ids = [
				"\\'; DROP TABLE customer_entitlements; --",
				"E'\\\\''",
				"'; SELECT 1; --",
				"x'||(SELECT 1)||'",
				"\\\\'' ; -- $1",
			];
			await postgres.client.unsafe(SEED_SQL);
			const result = await commitFlush({
				ctx: { db: postgres.db },
				request: {
					changes: ids.map((id) => ({
						op: "insert" as const,
						table: "customerEntitlements" as const,
						row: { id, entitlement_id: id },
					})),
					bookmarks: [
						{
							topic: "metering",
							partition: 7,
							expectedOffset: 9n,
							nextOffset: 10n,
						},
					],
				},
				statementTimeoutMs: 2_000,
				roundTrips: "single",
			});
			expect(result.applied).toEqual(ids.map(() => true));
			const rows = await postgres.client.unsafe(
				"SELECT id, entitlement_id FROM customer_entitlements WHERE id LIKE '%;%' OR id LIKE '%''%' ORDER BY id",
			);
			expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(
				[...ids, "ce_o'q\\$1"].sort(),
			);
			const [counted] = await postgres.client.unsafe(
				"SELECT count(*)::int AS n FROM customer_entitlements",
			);
			expect(counted?.n).toBe(3 + ids.length);
		});

		test("a localized lc_messages turns a routine guard miss into a 22P02 error on the single path only", async () => {
			const request: FlushRequest = {
				changes: [
					{
						op: "update",
						table: "customerEntitlements",
						id: "ce_2",
						set: {},
						add: { balance: 1 },
						addEntries: {},
						guard: {},
					},
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
				bookmarks: [
					{
						topic: "metering",
						partition: 3,
						expectedOffset: 40n,
						nextOffset: 42n,
						claimToken: "claim-3",
					},
				],
			};
			await postgres.client.unsafe(
				"ALTER DATABASE postgres SET lc_messages = 'de_DE.utf8'",
			);
			const localized = createPostgresClient({
				config: {
					databaseUrl: databaseUrl as string,
					maxConnections: 1,
					connectTimeout: 10,
					idleTimeout: 30,
				},
			});
			try {
				const transaction = await runArm({
					request,
					roundTrips: "transaction",
				});
				await postgres.client.unsafe(SEED_SQL);
				let single: unknown;
				try {
					single = {
						result: await commitFlush({
							ctx: { db: localized.db },
							request,
							statementTimeoutMs: 2_000,
							roundTrips: "single",
						}),
					};
				} catch (error) {
					const { name, errno, message } = error as Error & { errno?: string };
					single = { error: name, sqlState: errno, message };
				}
				console.log(
					"localized single outcome:",
					single,
					"transaction outcome:",
					transaction.outcome,
				);
				expect(transaction.outcome).toEqual({
					result: { applied: [true, false] },
				});
				expect(single).toEqual(transaction.outcome);
			} finally {
				await localized.close();
				await postgres.client.unsafe(
					"ALTER DATABASE postgres RESET lc_messages",
				);
			}
		});
	},
);
