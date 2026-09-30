import { Database } from "bun:sqlite";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
	applyMutation,
	catalogRowsToCatalog,
	computeTrack,
	type SubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { createTrackCommand, testIdentity } from "../../fixtures/mutations.js";
import { scenarios } from "../track-throughput/scenarios.js";

/**
 * One process of the spike: tracks against slot files that other processes write too.
 * locked: read, decide and write inside BEGIN IMMEDIATE. optimistic: decide outside, write only if nobody else did.
 */
const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, value] = arg.replace(/^--/, "").split("=");
		return [key, value ?? "true"];
	}),
);
const mode = args.mode as "locked" | "optimistic";
const dir = args.dir;
const slots = Number(args.slots);
const customersPerSlot = Number(args.customersPerSlot);
const durationMs = Number(args.durationMs);
const scenario = scenarios[args.scenario];
const workerIndex = Number(args.worker);
const startAt = Number(args.startAt);

const catalog = catalogRowsToCatalog({ rows: scenario.catalogRows });
const databases = Array.from({ length: slots }, (_, slot) => {
	const db = new Database(join(dir, `slot-${slot}.sqlite`));
	// First: another process may be recovering this file's log right now, and only the busy handler waits for it.
	db.exec("PRAGMA busy_timeout = 10000");
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA synchronous = NORMAL");
	return {
		db,
		select: db.prepare<{ state: string; revision: number }, [string]>(
			"SELECT state, revision FROM subject_states WHERE customer_id = ?",
		),
		update: db.prepare(
			"UPDATE subject_states SET state = ?, revision = revision + 1 WHERE customer_id = ?",
		),
		updateIfUnchanged: db.prepare(
			"UPDATE subject_states SET state = ?, revision = revision + 1 WHERE customer_id = ? AND revision = ?",
		),
	};
});

/** Read the customer, run the engine's track on it, and return the rows to write back. */
const decide = ({
	stateJson,
	customerId,
	featureId,
	commandId,
}: {
	stateJson: string;
	customerId: string;
	featureId: string;
	commandId: string;
}): string => {
	const state = JSON.parse(stateJson) as SubjectState;
	const fullSubject = subjectStateToFullSubject({
		state,
		catalog,
		entityId: null,
	});
	const command = createTrackCommand({
		identity: { ...testIdentity, customerId },
		commandId,
		featureId,
		value: 1,
	});
	const mutation = computeTrack({ fullSubject, command });
	return JSON.stringify(applyMutation({ state, mutation }));
};

let retries = 0;
const trackLocked = ({
	slot,
	customerId,
	featureId,
	commandId,
}: {
	slot: number;
	customerId: string;
	featureId: string;
	commandId: string;
}) => {
	const { db, select, update } = databases[slot];
	db.transaction(() => {
		const row = select.get(customerId);
		if (!row) throw new Error(`No row for ${customerId}`);
		const next = decide({
			stateJson: row.state,
			customerId,
			featureId,
			commandId,
		});
		update.run(next, customerId);
	}).immediate();
};

const trackOptimistic = ({
	slot,
	customerId,
	featureId,
	commandId,
}: {
	slot: number;
	customerId: string;
	featureId: string;
	commandId: string;
}) => {
	const { select, updateIfUnchanged } = databases[slot];
	for (;;) {
		const row = select.get(customerId);
		if (!row) throw new Error(`No row for ${customerId}`);
		const next = decide({
			stateJson: row.state,
			customerId,
			featureId,
			commandId,
		});
		const { changes } = updateIfUnchanged.run(next, customerId, row.revision);
		if (changes > 0) return;
		retries++;
	}
};

const track = mode === "locked" ? trackLocked : trackOptimistic;

// Every process starts at the same instant, so the contention is real from the first track.
while (Date.now() < startAt) await Bun.sleep(1);

const latencies: number[] = [];
const deadline = performance.now() + durationMs;
let tracks = 0;
const pick = (count: number) => Math.floor(Math.random() * count);
/** owned: a process only ever touches the slots that are its own, so no two processes share a file. */
const ownedSlots = Array.from({ length: slots }, (_, slot) => slot).filter(
	(slot) => slot % Number(args.processes) === workerIndex,
);
const pickSlot = () =>
	args.ownership === "owned"
		? ownedSlots[pick(ownedSlots.length)]
		: pick(slots);
while (performance.now() < deadline) {
	const slot = pickSlot();
	const customerId = `cus_${slot}_${pick(customersPerSlot)}`;
	const featureId = scenario.features[pick(scenario.features.length)];
	const before = performance.now();
	track({
		slot,
		customerId,
		featureId,
		commandId: `trk_${workerIndex}_${tracks}`,
	});
	latencies.push(performance.now() - before);
	tracks++;
}
latencies.sort((left, right) => left - right);
const micros = (ms: number) => Math.round(ms * 1000);
console.log(
	JSON.stringify({
		tracks,
		retries,
		p50Micros: micros(latencies[Math.floor(latencies.length * 0.5)] ?? 0),
		p99Micros: micros(latencies[Math.floor(latencies.length * 0.99)] ?? 0),
	}),
);
for (const { db } of databases) db.close();
