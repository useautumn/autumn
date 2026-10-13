/**
 * A state from a newer worker build: a field, a column and an enum value this build does not know are carried
 * through the store, a checkpoint and a snapshot as written. A rollback must never turn one new field into a
 * customer this build cannot read.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { createPartitionCheckpoint } from "../../../src/checkpoint/partitionCheckpoint.js";
import {
	decodePartitionCheckpoint,
	encodePartitionCheckpoint,
} from "../../../src/checkpoint/partitionCheckpointEncoding.js";
import { snapshotStateOf } from "../../../src/processor/subject/snapshotLoader/rules/snapshotStateOf.js";
import { openStateStore } from "../../../src/state/openStateStore.js";
import {
	createState,
	testIdentity as identity,
	restoreSubjectStates,
} from "../../fixtures/mutations.js";

const topic = "metering-events-v1";
const partition = 0;

/** The state as a newer build serialises it: a new field on the state, a new column and a new API version on a row. */
const fromNewerBuild = (state: SubjectState): SubjectState => {
	const newer = JSON.parse(JSON.stringify(state));
	newer.futureField = true;
	newer.customerProducts[0].api_semver = "9.9.0";
	newer.customerProducts[0].futureColumn = "kept";
	return newer;
};

describe("a newer build's state", () => {
	test("restored from a checkpoint is read back from the store as written", () => {
		const directory = mkdtempSync(join(tmpdir(), "autumn-balance-worker-"));
		const store = openStateStore({
			databasePath: join(directory, "balance-state.sqlite"),
		});
		try {
			store.initializePartition({ topic, partition, nextOffset: 0n });
			const state = fromNewerBuild(createState());
			restoreSubjectStates({ store, topic, partition, states: [state] });

			expect(store.readState({ identity })).toEqual(state);
		} finally {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("survives a checkpoint's encoding as written", async () => {
		const state = fromNewerBuild(createState());
		const checkpoint = createPartitionCheckpoint({
			engineSchemaVersion: 1,
			createdAt: 1_700_000_000_000,
			topic,
			partition,
			nextOffset: 1n,
			states: [
				{ subjectKey: meteringIdentityToSubjectKey({ identity }), state },
			],
			receipts: [],
		});
		const limits = {
			maxCompressedBytes: 1_000_000,
			maxSerializedBytes: 1_000_000,
		};

		const encoded = await encodePartitionCheckpoint({ checkpoint, limits });
		const decoded = await decodePartitionCheckpoint({
			body: encoded.body,
			limits,
		});

		expect(decoded.states[0]?.state).toEqual(state);
	});

	test("is served from a snapshot row instead of falling through to a full read", () => {
		const state = fromNewerBuild({ ...createState(), revision: 12 });

		expect(snapshotStateOf({ snapshot: state })).toEqual({
			...state,
			revision: 0,
		});
	});
});
