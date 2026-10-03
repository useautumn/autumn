import { describe, expect, test } from "bun:test";
import type { MeteringIdentity } from "@autumn/balance-engine";
import { BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION } from "@autumn/env/balanceWorkerConstants";
import type { SubjectSnapshotRow } from "@autumn/postgres";
import {
	decideSnapshotHit,
	SNAPSHOT_AS_OF_SKEW_MS,
} from "../../../../../src/processor/subject/snapshotLoader/rules/decideSnapshotHit.js";
import { createState } from "../../../../fixtures/mutations.js";

const identity: MeteringIdentity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const NOW = 1_700_000_000_000;
const TTL_MS = 3_600_000;

const rowOf = (
	overrides: Partial<SubjectSnapshotRow> = {},
): SubjectSnapshotRow => ({
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
	stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION,
	state: { ...createState({ identity, balance: 95 }), revision: 12 },
	baselineAt: NOW - 1_000,
	...overrides,
});

const decide = (row: SubjectSnapshotRow | undefined, asOf = NOW) =>
	decideSnapshotHit({ row, identity, asOf, now: NOW, ttlMs: TTL_MS });

describe("decideSnapshotHit", () => {
	test("a row by this build, younger than the TTL, naming this subject, is the state a full read would answer: revision 0", () => {
		const decided = decide(rowOf());
		if (!decided.hit) throw new Error(`expected a hit, got ${decided.reason}`);
		expect(decided.state.revision).toBe(0);
		expect(decided.state.customerEntitlements[0]?.balance).toBe(95);
		expect(decided.state.identity).toEqual(identity);
	});

	test.each([
		["absent", undefined],
		[
			"version",
			rowOf({ stateVersion: BALANCE_WORKER_SUBJECT_SNAPSHOT_VERSION + 1 }),
		],
		["expired", rowOf({ baselineAt: NOW - TTL_MS })],
		["parse", rowOf({ state: { schemaVersion: 1, nope: true } })],
		[
			"identity",
			rowOf({
				state: createState({
					identity: { ...identity, customerId: "cus_other" },
				}),
			}),
		],
	] as const)("%s is a miss, by that reason", (reason, row) => {
		expect(decide(row)).toEqual({ hit: false, reason });
	});

	test("a read outside the allowed skew from now is a replay and never trusts the row; the boundary itself is a read for now", () => {
		expect(decide(rowOf(), NOW - SNAPSHOT_AS_OF_SKEW_MS - 1)).toEqual({
			hit: false,
			reason: "asOf",
		});
		expect(decide(rowOf(), NOW + SNAPSHOT_AS_OF_SKEW_MS).hit).toBe(true);
	});

	test("the TTL counts from the row's last full read, not its last write: a row one millisecond inside it hits", () => {
		expect(decide(rowOf({ baselineAt: NOW - TTL_MS + 1 })).hit).toBe(true);
	});
});
