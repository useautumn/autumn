/**
 * Reconciles a soak run: every request the client saw succeed (outcomes.log, "200") has exactly one applied
 * deduction in the metering log (read from the beginning, read_committed), no command id is applied twice, and
 * each balance row the log deducted from ends in Postgres at its seed minus the log's deductions.
 * Streams outcomes.log, so it runs on multi-million-request soaks; standalone:
 *
 *   KAFKA_BROKERS=... DATABASE_URL=... bun tests/benchmarks/ownership-handoff/reconcileSoak.ts <out dir> <metering topic>
 */
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { type Kafka, parseTrustedMeteringRecord } from "@autumn/kafka";
import type { PostgresClient } from "@autumn/postgres";
import { sql } from "drizzle-orm";

type AppliedTrack = {
	command: { type: string; commandId?: string };
	result: {
		status?: string;
		deltas?: { table?: string; id: string; balanceDelta: number }[];
	};
};

export async function reconcileSoak({
	kafka,
	postgres,
	outDir,
	topic,
	seedBalance,
}: {
	kafka: Kafka;
	postgres: PostgresClient;
	outDir: string;
	topic: string;
	seedBalance: number;
}) {
	const admin = kafka.admin();
	await admin.connect();
	const ends = await admin.fetchTopicOffsets(topic);
	await admin.disconnect();
	const remaining = new Map(
		ends
			.filter((e) => BigInt(e.high) > 0n)
			.map((e) => [e.partition, BigInt(e.high)]),
	);
	/** Command id → times applied; 1 byte per id keeps a 3M-command run in a few hundred MB. */
	const appliedByCommand = new Map<string, number>();
	const deducted = new Map<string, number>();
	let logRecords = 0;
	let rejectedRecords = 0;
	let nonMutationRecords = 0;
	let staleRecords = 0;
	const staleCommands = new Set<string>();
	/** Per partition, the highest owner epoch seen so far: a record under a lower epoch after it is a zombie's, which readers drop. */
	const fenceEpoch = new Map<number, bigint>();
	const reader = kafka.consumer({
		groupId: `reconcile-${crypto.randomUUID()}`,
		readUncommitted: false,
		maxWaitTimeInMs: 250,
	});
	await reader.connect();
	await reader.subscribe({ topics: [topic], fromBeginning: true });
	const caughtUp = Promise.withResolvers<void>();
	if (remaining.size === 0) caughtUp.resolve();
	await reader.run({
		eachBatch: async ({ batch, resolveOffset }) => {
			for (const message of batch.messages) {
				logRecords++;
				const epochHeader = message.headers?.ownerEpoch;
				const epochText = Array.isArray(epochHeader)
					? epochHeader[0]?.toString()
					: epochHeader?.toString();
				const epoch = epochText === undefined ? undefined : BigInt(epochText);
				const fence = fenceEpoch.get(batch.partition);
				const stale =
					epoch !== undefined && fence !== undefined && epoch < fence;
				if (epoch !== undefined && (fence === undefined || epoch > fence))
					fenceEpoch.set(batch.partition, epoch);
				let record: AppliedTrack;
				try {
					record = parseTrustedMeteringRecord({
						key: message.key,
						value: message.value,
					}) as unknown as AppliedTrack;
				} catch {
					nonMutationRecords++;
					continue;
				}
				const id = record.command.commandId;
				if (record.command.type !== "track" || !id) continue;
				if (stale) {
					staleRecords++;
					staleCommands.add(id);
					continue;
				}
				if (record.result.status !== "applied") {
					rejectedRecords++;
					continue;
				}
				appliedByCommand.set(id, (appliedByCommand.get(id) ?? 0) + 1);
				for (const delta of record.result.deltas ?? [])
					deducted.set(
						delta.id,
						(deducted.get(delta.id) ?? 0) - delta.balanceDelta,
					);
			}
			const last = batch.lastOffset();
			resolveOffset(last);
			const target = remaining.get(batch.partition);
			if (target !== undefined && BigInt(last) + 1n >= target) {
				remaining.delete(batch.partition);
				if (remaining.size === 0) caughtUp.resolve();
			}
		},
	});
	const stalled = Bun.sleep(600_000).then(() => "stalled" as const);
	if ((await Promise.race([caughtUp.promise, stalled])) === "stalled")
		throw new Error(`metering log read stalled on ${[...remaining.keys()]}`);
	await reader.disconnect();

	let acknowledged = 0;
	let acknowledgedMissingFromLog = 0;
	let acknowledgedStale = 0;
	const failedButApplied: Record<string, number> = {};
	const seen = new Set<string>();
	const lines = createInterface({
		input: createReadStream(join(outDir, "outcomes.log")),
	});
	for await (const line of lines) {
		if (!line) continue;
		const [id, outcome] = line.split(" ");
		seen.add(id);
		if (outcome === "200") {
			acknowledged++;
			if (!appliedByCommand.has(id)) acknowledgedMissingFromLog++;
			if (staleCommands.has(id)) acknowledgedStale++;
		} else if (appliedByCommand.has(id))
			failedButApplied[outcome] = (failedButApplied[outcome] ?? 0) + 1;
	}
	let duplicatedCommands = 0;
	let appliedNeverSent = 0;
	for (const [id, count] of appliedByCommand) {
		if (count > 1) duplicatedCommands++;
		if (!seen.has(id)) appliedNeverSent++;
	}
	const balances: { id: string; postgres: number; expected: number }[] = [];
	for (const [id, amount] of deducted) {
		const { rows } = await postgres.db.execute(
			sql`SELECT balance FROM customer_entitlements WHERE id = ${id}`,
		);
		balances.push({
			id,
			postgres: Number(rows[0]?.balance),
			expected: seedBalance - amount,
		});
	}
	const balanceMismatches = balances.filter((b) => b.postgres !== b.expected);
	return {
		logRecords,
		rejectedRecords,
		nonMutationRecords,
		staleRecords,
		acknowledgedStale,
		appliedCommands: appliedByCommand.size,
		acknowledged,
		acknowledgedMissingFromLog,
		duplicatedCommands,
		appliedNeverSent,
		failedButApplied,
		balanceRows: balances.length,
		balanceMismatches,
		ok:
			acknowledgedMissingFromLog === 0 &&
			duplicatedCommands === 0 &&
			balanceMismatches.length === 0,
	};
}

if (import.meta.main) {
	const [outDir, topic] = process.argv.slice(2);
	if (!outDir || !topic) throw new Error("usage: <out dir> <metering topic>");
	const { createTestKafka } = await import("../../fixtures/testKafka.js");
	const { openFixturePostgres } = await import(
		"../../integration/postgres/postgresCustomerFixture.js"
	);
	const brokers = (process.env.KAFKA_BROKERS ?? "").split(",").filter(Boolean);
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");
	const postgres = openFixturePostgres({ databaseUrl });
	const result = await reconcileSoak({
		kafka: createTestKafka({ clientId: "reconcile", brokers }),
		postgres,
		outDir,
		topic,
		seedBalance: Number(process.env.SEED_BALANCE ?? 1_000_000_000),
	});
	await Bun.write(
		join(outDir, "reconciliation.json"),
		JSON.stringify(result, null, 1),
	);
	console.log(JSON.stringify(result, null, 1));
	await postgres.close();
	process.exit(0);
}
