import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrack,
	LockAlreadyExistsError,
	type SubjectState,
	type TrackCommand,
} from "../../../../src/balanceEngine.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
	occurredAt,
} from "../../engineFixtures.js";

const lock = {
	id: "lck_1",
	lockId: "L1",
	expiresAt: occurredAt + 86_400_000,
	expiryAction: "confirm",
} as const;

const lockedTrack = ({
	value = 8,
	lockId = lock.lockId,
	id = lock.id,
}: {
	value?: number;
	lockId?: string;
	id?: string;
} = {}): TrackCommand => ({
	...createTrackCommand({ value, commandId: `cmd_${id}` }),
	lock: { ...lock, id, lockId },
});

const track = ({
	state,
	command,
}: {
	state: SubjectState;
	command: TrackCommand;
}) => computeTrack({ fullSubject: createSubjectFor({ state }), command });

describe("a locked track", () => {
	test.concurrent("deducts and inserts the lock row in one mutation", () => {
		const mutation = track({ state: createState(), command: lockedTrack() });
		const lockChange = mutation.changes.find(
			(change) => change.table === "locks",
		);
		expect(lockChange).toMatchObject({
			op: "insert",
			row: {
				id: "lck_1",
				lock_id: "L1",
				feature_id: "messages",
				overage_behavior: "reject",
				expiry_action: "confirm",
				created_at: occurredAt,
				deltas: [{ id: "messages_monthly", balanceDelta: -8, valueDelta: -8 }],
			},
		});
		expect(
			mutation.changes.some(
				(change) => change.table === "customerEntitlements",
			),
		).toBe(true);
	});

	test.concurrent(
		"a duplicate lock id deducts nothing and writes nothing",
		() => {
			const state = createState();
			const opened = applyMutation({
				state,
				mutation: track({ state, command: lockedTrack() }),
			});
			expect(opened.openLocks).toEqual([{ id: "lck_1", lock_id: "L1" }]);
			expect(() =>
				track({ state: opened, command: lockedTrack({ id: "lck_2" }) }),
			).toThrow(new LockAlreadyExistsError({ lockId: "L1" }));
		},
	);

	test.concurrent("a different lock id on the same customer is fine", () => {
		const state = createState();
		const opened = applyMutation({
			state,
			mutation: track({ state, command: lockedTrack({ value: 3 }) }),
		});
		const second = applyMutation({
			state: opened,
			mutation: track({
				state: opened,
				command: lockedTrack({ value: 3, id: "lck_2", lockId: "L2" }),
			}),
		});
		expect(second.openLocks).toHaveLength(2);
	});

	test.concurrent("a rejected track holds nothing, so it opens no lock", () => {
		const mutation = track({
			state: createState(),
			command: lockedTrack({ value: 11 }),
		});
		expect(mutation.result).toMatchObject({ status: "rejected" });
		expect(mutation.changes).toEqual([]);
	});

	test.concurrent("a track without a lock is untouched", () => {
		const mutation = track({
			state: createState(),
			command: createTrackCommand(),
		});
		expect(mutation.changes.some((change) => change.table === "locks")).toBe(
			false,
		);
	});
});
