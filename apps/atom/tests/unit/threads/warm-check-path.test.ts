import { expect, test } from "bun:test";
import type { ReplicaFolders } from "../../../src/replication/types/replicaFolders.js";
import type { Slots } from "../../../src/slots/types/slots.js";
import type { SqliteStore } from "../../../src/state/types/sqliteStore.js";
import { warmCheckPath } from "../../../src/threads/warmUp/warmCheckPath.js";
import { storedSubjectWith } from "../utils/atomFixtures.js";

/** One folder whose owned stores hold the given subjects; records each check it is asked. */
const foldersHolding = ({
	stores,
	failCheck = false,
}: {
	stores: ReturnType<typeof storedSubjectWith>[][];
	failCheck?: boolean;
}) => {
	const checked: unknown[] = [];
	const slots = {
		ownedStores: () =>
			stores.map(
				(subjects) =>
					({
						listAppliedAfter: () =>
							subjects
								.slice(0, 1)
								.map((subject) => ({ subject, appliedAt: 1 })),
					}) as unknown as SqliteStore,
			),
		processorFor: () => ({
			check: async ({ request }: { request: unknown }) => {
				checked.push(request);
				if (failCheck) throw new Error("cannot answer");
				return { json: "{}", allowed: true };
			},
			setSubject: async () => ({ stored: true, entityId: null }),
		}),
	} as unknown as Slots;
	const folders: ReplicaFolders = {
		all: () => [{ atomId: null, slots }],
		learn: () => {},
	};
	return { folders, checked };
};

test("a thread answers one check from the first subject it owns, through the route's own request contract", async () => {
	const { folders, checked } = foldersHolding({
		stores: [[], [storedSubjectWith({ balance: 10 })]],
	});

	await warmCheckPath({ folders });

	expect(checked).toHaveLength(1);
	expect(checked[0]).toMatchObject({
		requestId: "atom_warm_up",
		params: { customer_id: "cus_1", feature_id: "messages" },
	});
});

test("a thread holding nothing checks nothing, and a check that cannot be answered never fails the start", async () => {
	const empty = foldersHolding({ stores: [[]] });
	await warmCheckPath({ folders: empty.folders });
	expect(empty.checked).toEqual([]);

	const failing = foldersHolding({
		stores: [[storedSubjectWith({ balance: 10 })]],
		failCheck: true,
	});
	await expect(
		warmCheckPath({ folders: failing.folders }),
	).resolves.toBeUndefined();
});
