import { describe, expect, test } from "bun:test";
import {
	createSubjectState,
	type MutationRecord,
	type SubjectState,
} from "@autumn/balance-engine";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { ensureSubjectState } from "../../../../src/processor/subject/actions/ensureSubject/ensureSubjectState.js";
import { SubjectNotFoundError } from "../../../../src/processor/subject/subjectErrors.js";
import type { SubjectScope } from "../../../../src/processor/subject/types/subject.js";
import { commandToFingerprint } from "../../../../src/processor/writer/receipt/commandToFingerprint.js";
import { mutationToRecord } from "../../../../src/processor/writer/receipt/mutationToRecord.js";
import type { MutationSubmission } from "../../../../src/processor/writer/types/mutation.js";
import { createTestCatalogCache } from "../../../fixtures/catalog.js";

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
};
const emptyState = createSubjectState({ identity });
const emptyEnvelope: SubjectRowsEnvelope = {
	customer: {
		internal_id: "cus_internal_1",
		id: "cus_1",
		org_id: "org_1",
		env: AppEnv.Sandbox,
		config: null,
	},
	customer_products: [],
	customer_entitlements: [],
	rollovers: [],
	entity: null,
};

/** Applies `mutate` against the held state and commits synchronously, the way the real writer does minus Kafka. */
const createFakeWriter = ({ initial }: { initial: SubjectState | null }) => {
	let state = initial;
	const committed: MutationRecord[] = [];
	const decide = <Reply>(submission: MutationSubmission<Reply>) => {
		const result = submission.mutate({ state });
		if (result.kind === "reply") {
			return { waitForCommit: async () => result.reply };
		}
		const { nextState } = result;
		state = nextState;
		const record = mutationToRecord({
			mutation: result.mutation,
			fingerprint: commandToFingerprint({ command: submission.command }),
			receiptPolicy: { retentionMs: 60_000, now: () => 1_700_000_000_000 },
		});
		committed.push(record);
		return {
			waitForCommit: async () => ({
				kind: "new" as const,
				mutation: record,
				state: nextState,
			}),
		};
	};
	return {
		decide,
		committed,
		readState: () => state,
		readFreshestState: () => state,
	};
};

const createScope = ({
	initial,
	rows,
}: {
	initial: SubjectState | null;
	rows: SubjectRowsEnvelope | null;
}) => {
	const writer = createFakeWriter({ initial });
	let sourceCalls = 0;
	let releaseSource: () => void = () => {};
	const sourceGate = new Promise<void>((resolve) => {
		releaseSource = resolve;
	});
	const scope: SubjectScope = {
		ctx: {
			catalogCache: createTestCatalogCache(),
			db: {
				getSubjectRows: async () => {
					sourceCalls += 1;
					await sourceGate;
					return rows;
				},
			},
			writer,
			receiptPolicy: { retentionMs: 60_000, now: () => 1_700_000_000_000 },
		},
		state: { hydrationPromises: new Map() },
	};
	return {
		scope,
		writer,
		sourceCalls: () => sourceCalls,
		releaseSource: () => releaseSource(),
	};
};

describe("ensure subject state", () => {
	test("local state is returned without touching the source", async () => {
		const { scope, sourceCalls } = createScope({
			initial: { ...emptyState, revision: 3 },
			rows: null,
		});

		const state = await ensureSubjectState({ scope, identity });

		expect(state.revision).toBe(3);
		expect(sourceCalls()).toBe(0);
	});

	test("a missing customer is hydrated once and becomes revision one", async () => {
		const { scope, writer, sourceCalls, releaseSource } = createScope({
			initial: null,
			rows: emptyEnvelope,
		});

		const first = ensureSubjectState({ scope, identity });
		const second = ensureSubjectState({ scope, identity });
		expect(scope.state.hydrationPromises.size).toBe(1);
		releaseSource();
		const [firstState, secondState] = await Promise.all([first, second]);

		expect(sourceCalls()).toBe(1);
		expect(firstState.revision).toBe(1);
		expect(secondState).toEqual(firstState);
		expect(writer.committed).toHaveLength(1);
		expect(writer.committed[0]?.command.type).toBe("initialize");
		expect(writer.readState()?.revision).toBe(1);
		expect(scope.state.hydrationPromises.size).toBe(0);
	});

	test("a customer the source does not know is a typed error and nothing is appended", async () => {
		const { scope, writer, releaseSource } = createScope({
			initial: null,
			rows: null,
		});
		releaseSource();

		await expect(
			ensureSubjectState({ scope, identity }),
		).rejects.toBeInstanceOf(SubjectNotFoundError);
		expect(writer.committed).toHaveLength(0);
		expect(scope.state.hydrationPromises.size).toBe(0);
	});
});
