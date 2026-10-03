import { parseArgs } from "node:util";
import {
	customerRowsToSubjectState,
	type SubjectState,
} from "@autumn/balance-engine";
import {
	commitFlush,
	createPostgresClient,
	getSubjectRows,
	insertPartitionProgress,
	type SubjectRowChange,
	type SubjectSnapshotWrites,
} from "@autumn/postgres";
import { sql } from "drizzle-orm";
import {
	type SeededCustomer,
	seedCustomer,
} from "../../integration/postgres/postgresCustomerFixture.js";

const { values: args } = parseArgs({
	options: {
		rounds: { type: "string", default: "200" },
		customers: { type: "string", default: "100" },
		stateKb: { type: "string", default: "8" },
		shape: { type: "string", default: "entropy" },
	},
});
const ROUNDS = Number(args.rounds);
const CUSTOMERS = Number(args.customers);
const STATE_BYTES = Number(args.stateKb) * 1024;
const SHAPE = args.shape;
if (SHAPE !== "entropy" && SHAPE !== "realistic")
	throw new Error("shape must be entropy or realistic");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
	throw new Error("DATABASE_URL is required (a migrated Postgres)");

const postgres = createPostgresClient({
	config: {
		databaseUrl,
		maxConnections: 1,
		connectTimeout: 10,
		idleTimeout: 30,
	},
});
const customers: SeededCustomer[] = [];
const realisticStates = new Map<string, SubjectState>();
for (let index = 0; index < CUSTOMERS; index++)
	customers.push(await seedCustomer({ postgres, balance: 1_000_000 }));
if (SHAPE === "realistic") {
	for (const [index, customer] of customers.entries()) {
		const identity = {
			orgId: "org_snap531",
			env: "sandbox",
			customerId: `snap_a_${index + 1}`,
			entityId: null,
		};
		const envelope = await getSubjectRows({
			ctx: { db: postgres.db, orgId: identity.orgId, env: identity.env },
			customerId: identity.customerId,
			entityId: null,
			asOfTimestampMs: Date.now(),
		});
		if (!envelope)
			throw new Error(
				"Seed the ATMN-531 synthetic shape before running --shape realistic",
			);
		const state = customerRowsToSubjectState({
			identity,
			customer: envelope.customer,
			customerProducts: envelope.customer_products,
			customerPrices: envelope.customer_prices,
			customerEntitlements: envelope.customer_entitlements,
			rollovers: envelope.rollovers,
			replaceables: envelope.replaceables,
			usageWindows: envelope.usage_windows,
			openLocks: envelope.open_locks,
			pooledBalances: envelope.pooled_balances,
			customerLicenses: envelope.customer_licenses,
			entity: envelope.entity,
		});
		realisticStates.set(customer.internalCustomerId, state);
	}
}
const topic = `snapshot-flush-${crypto.randomUUID().slice(0, 8)}`;
await insertPartitionProgress({
	ctx: { db: postgres.db },
	topic,
	partition: 0,
	nextOffset: 0n,
});

const stateJsonOf = ({
	customer,
	round,
}: {
	customer: SeededCustomer;
	round: number;
}) => {
	const realistic = realisticStates.get(customer.internalCustomerId);
	if (realistic)
		return JSON.stringify({
			...realistic,
			identity: customer.identity,
			revision: round,
			customer: {
				...realistic.customer,
				id: customer.identity.customerId,
				internal_id: customer.internalCustomerId,
			},
			customerEntitlements: realistic.customerEntitlements.map(
				(entitlement, index) =>
					index === 0
						? { ...entitlement, balance: 1_000_000 - round }
						: entitlement,
			),
		});
	return JSON.stringify({
		schemaVersion: 1,
		identity: customer.identity,
		revision: round,
		customerEntitlements: [
			{ id: customer.customerEntitlementId, balance: 1_000_000 - round },
		],
		padding: Array.from({ length: Math.ceil(STATE_BYTES / 36) }, () =>
			crypto.randomUUID(),
		)
			.join("")
			.slice(0, STATE_BYTES),
	});
};

const changesOf = (): SubjectRowChange[] =>
	customers.map((customer) => ({
		op: "update",
		table: "customerEntitlements",
		id: customer.customerEntitlementId,
		set: {},
		add: { balance: -1 },
		addEntries: {},
		guard: {},
	}));

const snapshotsOf = ({
	mode,
	round,
}: {
	mode: Mode;
	round: number;
}): SubjectSnapshotWrites | undefined => {
	if (mode === "off") return undefined;
	if (mode === "delete")
		return {
			upserts: [],
			deletes: customers.map((customer) => ({
				orgId: customer.orgId,
				env: customer.env,
				customerId: customer.identity.customerId,
			})),
		};
	return {
		upserts: customers.map((customer) => ({
			orgId: customer.orgId,
			env: customer.env,
			customerId: customer.identity.customerId,
			entityId: null,
			internalCustomerId: customer.internalCustomerId,
			internalEntityId: null,
			partition: 0,
			partitionCount: 64,
			stateVersion: 1,
			stateJson: stateJsonOf({ customer, round }),
			baselineAt: Date.now(),
			logOffset: BigInt(round),
		})),
		deletes: [],
	};
};

type Mode = "off" | "write" | "delete";
const modes: Mode[] = ["off", "write", "delete"];
const timings: Record<Mode, number[]> = { off: [], write: [], delete: [] };
const walBytes: Record<Mode, number[]> = { off: [], write: [], delete: [] };
const walLsn = async () =>
	String(
		(
			(await postgres.db.execute(
				sql`SELECT pg_current_wal_lsn()::text AS lsn`,
			)) as {
				lsn: string;
			}[]
		)[0]?.lsn,
	);
const walDiff = async ({ from, to }: { from: string; to: string }) =>
	Number(
		(
			(await postgres.db.execute(
				sql`SELECT pg_wal_lsn_diff(${to}::pg_lsn, ${from}::pg_lsn) AS bytes`,
			)) as { bytes: string }[]
		)[0]?.bytes,
	);

let offset = 0n;
// Seed every snapshot row once so "write" measures the steady state: an update in place, not an insert.
for (const mode of ["write", "write"] as Mode[]) {
	await commitFlush({
		ctx: { db: postgres.db },
		request: {
			changes: changesOf(),
			bookmarks: [
				{
					topic,
					partition: 0,
					expectedOffset: offset,
					nextOffset: offset + 1n,
				},
			],
			snapshots: snapshotsOf({ mode, round: 0 }),
		},
		statementTimeoutMs: 10_000,
	});
	offset += 1n;
}
// Read after seeding, so the counters cover the measured rounds only.
const hotBefore = (await postgres.db.execute(
	sql`SELECT n_tup_upd, n_tup_hot_upd FROM pg_stat_user_tables WHERE relname = 'subject_snapshots'`,
)) as { n_tup_upd: string; n_tup_hot_upd: string }[];
async function measureFlush({ mode, round }: { mode: Mode; round: number }) {
	const request = {
		changes: changesOf(),
		bookmarks: [
			{
				topic,
				partition: 0,
				expectedOffset: offset,
				nextOffset: offset + 1n,
			},
		],
		snapshots: snapshotsOf({ mode, round }),
	};
	const from = await walLsn();
	const startedAt = performance.now();
	await commitFlush({
		ctx: { db: postgres.db },
		request,
		statementTimeoutMs: 10_000,
	});
	timings[mode].push(performance.now() - startedAt);
	walBytes[mode].push(await walDiff({ from, to: await walLsn() }));
	offset += 1n;
	if (mode !== "delete") return;
	await commitFlush({
		ctx: { db: postgres.db },
		request: {
			changes: [],
			bookmarks: [
				{
					topic,
					partition: 0,
					expectedOffset: offset,
					nextOffset: offset + 1n,
				},
			],
			snapshots: snapshotsOf({ mode: "write", round }),
		},
		statementTimeoutMs: 10_000,
	});
	offset += 1n;
}

for (let round = 1; round <= ROUNDS; round++) {
	for (const mode of ["off", "write"] as const)
		await measureFlush({ mode, round });
}

await postgres.db.execute(sql`SELECT pg_stat_force_next_flush()`);
await postgres.db.execute(sql`SELECT pg_stat_clear_snapshot()`);
const hotAfter = (await postgres.db.execute(
	sql`SELECT n_tup_upd, n_tup_hot_upd FROM pg_stat_user_tables WHERE relname = 'subject_snapshots'`,
)) as { n_tup_upd: string; n_tup_hot_upd: string }[];
const payloadSizes = (await postgres.db.execute(
	sql`SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY octet_length(state::text)) AS raw_p50, percentile_disc(0.5) WITHIN GROUP (ORDER BY pg_column_size(state)) AS stored_p50 FROM subject_snapshots WHERE internal_customer_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(customers.map((customer) => customer.internalCustomerId))}::text::jsonb))`,
)) as { raw_p50: number; stored_p50: number }[];

for (let round = 1; round <= ROUNDS; round++)
	await measureFlush({ mode: "delete", round });

const percentile = (samples: number[], fraction: number) => {
	const sorted = [...samples].sort((a, b) => a - b);
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ??
		0
	);
};
const round2 = (value: number) => Math.round(value * 100) / 100;
const summary = Object.fromEntries(
	modes.map((mode) => [
		mode,
		{
			flushMs: {
				p50: round2(percentile(timings[mode], 0.5)),
				p99: round2(percentile(timings[mode], 0.99)),
			},
			walKbPerFlush: {
				p50: round2(percentile(walBytes[mode], 0.5) / 1024),
				mean: round2(
					walBytes[mode].reduce((total, bytes) => total + bytes, 0) /
						walBytes[mode].length /
						1024,
				),
			},
		},
	]),
);
const updates =
	Number(hotAfter[0]?.n_tup_upd ?? 0) - Number(hotBefore[0]?.n_tup_upd ?? 0);
const hotUpdates =
	Number(hotAfter[0]?.n_tup_hot_upd ?? 0) -
	Number(hotBefore[0]?.n_tup_hot_upd ?? 0);
console.log(
	JSON.stringify(
		{
			rounds: ROUNDS,
			customersPerFlush: CUSTOMERS,
			paddingBytes: SHAPE === "entropy" ? STATE_BYTES : 0,
			shape: SHAPE,
			payloadBytes: payloadSizes[0],
			...summary,
			snapshotUpdates: { total: updates, hot: hotUpdates },
		},
		null,
		1,
	),
);

await postgres.db.execute(
	sql`DELETE FROM partition_progress WHERE topic = ${topic}`,
);
for (const customer of customers) await customer.cleanup();
await postgres.close();
process.exit(0);
