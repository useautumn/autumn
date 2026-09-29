import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	type ConfirmExpiredLockCommand,
	computeConfirmExpiredLock,
	computeTrack,
	LockNotFoundError,
} from "../../../../src/balanceEngine.js";
import {
	createState,
	createSubjectFor,
	createTrackCommand,
	identity,
	occurredAt,
} from "../../engineFixtures.js";

const lockedState = () => {
	const state = createState();
	const mutation = computeTrack({
		fullSubject: createSubjectFor({ state }),
		command: {
			...createTrackCommand({ value: 8, commandId: "cmd_lock" }),
			lock: {
				id: "lck_1",
				lockId: "L1",
				expiresAt: occurredAt + 86_400_000,
				expiryAction: "confirm",
			},
		},
	});
	return applyMutation({ state, mutation });
};

const expireCommand = ({ id }: { id: string }): ConfirmExpiredLockCommand => ({
	schemaVersion: 1,
	type: "confirmExpiredLock",
	commandId: `cmd_expire_${id}`,
	requestId: "req_expire",
	identity,
	occurredAt,
	lock: { id, lock_id: "L1" },
});

describe("computeConfirmExpiredLock", () => {
	test.concurrent(
		"closes the lock and leaves every balance where the lock put it",
		() => {
			const state = lockedState();
			const mutation = computeConfirmExpiredLock({
				fullSubject: createSubjectFor({ state }),
				command: expireCommand({ id: "lck_1" }),
			});
			const after = applyMutation({ state, mutation });

			expect(mutation.changes).toEqual([
				{ table: "locks", op: "delete", id: "lck_1" },
			]);
			expect(after.openLocks).toEqual([]);
			expect(after.customerEntitlements).toEqual(state.customerEntitlements);
		},
	);

	test.concurrent(
		"a lock already settled is not found, and nothing is written",
		() => {
			expect(() =>
				computeConfirmExpiredLock({
					fullSubject: createSubjectFor({ state: lockedState() }),
					command: expireCommand({ id: "lck_gone" }),
				}),
			).toThrow(LockNotFoundError);
		},
	);
});
