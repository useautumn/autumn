import { describe, expect, test } from "bun:test";
import { applySubjectPush } from "../../../src/pushes/applyPushes.js";
import type { ReplicatedOperation } from "../../../src/replication/types/replicatedOperation.js";
import type { Slots } from "../../../src/slots/types/slots.js";

/** A folder whose owner thread stored the subject and names the entity it parsed. */
const slotsStoring = ({ entityId }: { entityId: string | null }) =>
	({
		atomId: null,
		processorFor: () => ({
			check: async () => {
				throw new Error("no checks here");
			},
			setSubject: async () => ({ stored: true, entityId }),
		}),
	}) as unknown as Slots;

const relaying = () => {
	const relayed: ReplicatedOperation[] = [];
	return {
		relayed,
		replication: {
			replicate: (operation: ReplicatedOperation) =>
				void relayed.push(operation),
			peers: async () => [],
			stop: async () => {},
		},
	};
};

describe("a stored push relayed to the other replicas", () => {
	test("is keyed by the subject its owner thread parsed, never by parsing the body again", async () => {
		for (const entityId of [null, "ent_1"]) {
			const { relayed, replication } = relaying();

			const stored = await applySubjectPush({
				slots: slotsStoring({ entityId }),
				customerId: "cus_1",
				body: "the body as text: only the owner thread parses it",
				replication,
			});

			expect(stored).toBe(true);
			expect(relayed.map(({ key }) => key)).toEqual([
				`cus_1\u0000${entityId ?? ""}`,
			]);
		}
	});
});
