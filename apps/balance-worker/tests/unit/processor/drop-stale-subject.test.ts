import { describe, expect, test } from "bun:test";
import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import { dropStaleSubject } from "../../../src/processor/actions/dropStaleSubject.js";
import type { PartitionProcessorScope } from "../../../src/processor/types/partitionProcessor.js";
import { createSubjectMap } from "../../../src/processor/writer/subjectMap/createSubjectMap.js";
import { createState, testIdentity } from "../../fixtures/mutations.js";

const createScope = () => {
	const subjects = createSubjectMap();
	const overtaken: string[] = [];
	const scope = {
		ctx: {
			subjectHydrator: {
				overtakeInFlightLoads: ({ customerKey }: { customerKey: string }) =>
					overtaken.push(customerKey),
			},
			writer: {
				evict: async ({ customerKey }: { customerKey: string }) =>
					subjects.evictCustomer({ customerKey }),
			},
		},
	} as unknown as PartitionProcessorScope;
	return { scope, subjects, overtaken };
};

describe("an evict naming one entity", () => {
	test("drops the whole customer: its own subject and every entity's, and overtakes the customer's loads", async () => {
		const { scope, subjects, overtaken } = createScope();
		const customerKey = meteringIdentityToPartitionKey({
			identity: testIdentity,
		});
		const state = createState();
		const subjectKeys = [
			customerKey,
			`${customerKey}:ent_named`,
			`${customerKey}:ent_sibling`,
		];
		for (const subjectKey of subjectKeys)
			subjects.setState({ subjectKey, customerKey, state });
		subjects.setState({ subjectKey: "other", customerKey: "other", state });

		await dropStaleSubject({
			scope,
			identity: { ...testIdentity, entityId: "ent_named" },
		});

		for (const subjectKey of subjectKeys)
			expect(subjects.readState({ subjectKey })).toBeNull();
		expect(subjects.readState({ subjectKey: "other" })).toEqual(state);
		expect(overtaken).toEqual([customerKey]);
	});
});
