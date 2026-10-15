import { describe, expect, test } from "bun:test";
import { parseTrackCommand } from "@autumn/balance-engine";
import type { SubjectRowChange } from "@autumn/postgres";
import { createCommitter } from "../../../src/committer/createCommitter.js";
import type { CommitterDb } from "../../../src/types/committerDb.js";
import {
	createState,
	createTrackCommand,
	createTrackMutation,
} from "../../fixtures/mutations.js";

const topic = "autumn-metering";

/** Lands every flush whole, keeping the row changes each carried. */
const createRecordingDb = () => {
	const flushed: SubjectRowChange[][] = [];
	const db: CommitterDb = {
		readPartitionProgress: async () => null,
		insertPartitionProgress: async () => {},
		claimPartitionProgress: async () => {},
		flush: async (request) => {
			flushed.push([...request.changes]);
			return { applied: request.changes.map(() => true) };
		},
	};
	return { db, flushed };
};

const flushTrack = async ({
	source,
}: {
	source?: { atomId: string; writerId: string; seq: number };
}) => {
	const { db, flushed } = createRecordingDb();
	const committer = createCommitter({
		ctx: { db },
		config: {
			concurrency: 1,
			maxRowsPerFlush: 500,
			retry: { degradedAfterAttempts: 1, initialBackoffMs: 1, maxBackoffMs: 1 },
		},
	});
	const state = createState({ balance: 100 });
	const command = parseTrackCommand({
		input: { ...createTrackCommand({ identity: state.identity }), source },
	});
	await committer.apply({
		topic,
		partition: 0,
		expectedOffset: 10n,
		records: [
			{
				position: { topic, partition: 0, offset: 10n },
				mutation: createTrackMutation({ state, command }),
			},
		],
	});
	await committer.drain();
	return flushed.flat().filter((change) => change.table === "customers");
};

describe("an Atom's journal seqs in the flush", () => {
	test("a track an Atom handed in sets the customer's atom_seqs, unguarded, and nothing else on the row", async () => {
		const customerChanges = await flushTrack({
			source: { atomId: "atom_1", writerId: "w_1", seq: 4 },
		});

		expect(customerChanges).toEqual([
			{
				op: "update",
				table: "customers",
				id: createState().customer.internal_id,
				set: { atom_seqs: { atom_1: { w_1: 4 } } },
				add: {},
				addEntries: {},
				guard: {},
			},
		]);
	});

	test("a flush with no track an Atom handed in writes nothing to customers", async () => {
		expect(await flushTrack({})).toEqual([]);
	});
});
