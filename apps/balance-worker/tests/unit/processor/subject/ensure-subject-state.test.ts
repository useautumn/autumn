import { describe, expect, test } from "bun:test";
import {
	createSubjectState,
	type MutationRecord,
	meteringIdentityToPartitionKey,
	type SubjectState,
} from "@autumn/balance-engine";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { ensureSubjectState } from "../../../../src/processor/subject/actions/ensureSubject/ensureSubjectState.js";
import { createEntityLoads } from "../../../../src/processor/subject/entityLoads/createEntityLoads.js";
import { createInFlightLoads } from "../../../../src/processor/subject/inFlightLoads/createInFlightLoads.js";
import { createSnapshotLoader } from "../../../../src/processor/subject/snapshotLoader/createSnapshotLoader.js";
import {
	SubjectLoadBusyError,
	SubjectLoadOvertakenError,
	SubjectNotFoundError,
} from "../../../../src/processor/subject/subjectErrors.js";
import { createSubjectJoinCache } from "../../../../src/processor/subject/subjectJoinCache/createSubjectJoinCache.js";
import type { SubjectScope } from "../../../../src/processor/subject/types/subject.js";
import { commandToFingerprint } from "../../../../src/processor/writer/receipt/commandToFingerprint.js";
import { mutationToRecord } from "../../../../src/processor/writer/receipt/mutationToRecord.js";
import type { MutationSubmission } from "../../../../src/processor/writer/types/mutation.js";
import { runWithAnswerDeadline } from "../../../../src/runtime/answerDeadline.js";
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
		created_at: 1_700_000_000_000,
		processor: null,
		metadata: null,
		send_email_receipts: false,
		config: null,
		spend_limits: null,
		overage_allowed: null,
		usage_limits: null,
		usage_alerts: null,
	},
	customer_products: [],
	customer_prices: [],
	customer_entitlements: [],
	rollovers: [],
	replaceables: [],
	usage_windows: [],
	pooled_balances: [],
	customer_licenses: [],
	open_locks: [],
	entity: null,
};

/** Applies `mutate` against the held state and commits synchronously, the way the real writer does minus Kafka. */
const createFakeWriter = ({ initial }: { initial: SubjectState | null }) => {
	let state = initial;
	const committed: MutationRecord[] = [];
	const decide = <Reply>(submission: MutationSubmission<Reply>) => {
		const result = submission.mutate({ state });
		if (result.kind === "reply") {
			return {
				kind: "reply" as const,
				waitForCommit: async () => result.reply,
				waitForStore: async () => undefined,
			};
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
			kind: "write" as const,
			waitForStore: async () => undefined,
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
		adopt: ({ state: adopted }: { state: SubjectState }) => adopted,
	};
};

/** Each read of the source waits for its own release, so a test can land an evict inside a chosen read. */
const createScope = ({
	initial,
	rows,
}: {
	initial: SubjectState | null;
	/** One envelope for every read, or one per read in order. */
	rows: SubjectRowsEnvelope | null | (SubjectRowsEnvelope | null)[];
}) => {
	const writer = createFakeWriter({ initial });
	const releases: (() => void)[] = [];
	const gates: Promise<void>[] = [];
	const gateOf = (read: number): Promise<void> => {
		gates[read] ??= new Promise<void>((resolve) => {
			releases[read] = resolve;
		});
		return gates[read];
	};
	let sourceCalls = 0;
	let releasedAll = false;
	const catalogCache = createTestCatalogCache();
	const scope: SubjectScope = {
		ctx: {
			catalogCache,
			db: {
				getSubjectRows: async () => {
					const read = sourceCalls;
					sourceCalls += 1;
					if (!releasedAll) await gateOf(read);
					return Array.isArray(rows) ? (rows[read] ?? null) : rows;
				},
				getEntitySubjectRows: async () => [],
				readSubjectSnapshots: async () => [],
			},
			writer,
			receiptPolicy: { retentionMs: 60_000, now: () => 1_700_000_000_000 },
		},
		state: {
			inFlightLoads: createInFlightLoads(),
			joinCache: createSubjectJoinCache({
				ctx: { catalogCache, config: { catalogRecheckMs: 300_000 } },
			}),
			entityLoads: createEntityLoads({ scopeOf: () => scope }),
			snapshotLoader: createSnapshotLoader({ scopeOf: () => scope }),
		},
	};
	return {
		scope,
		writer,
		sourceCalls: () => sourceCalls,
		releaseRead: (read: number) => {
			void gateOf(read);
			releases[read]?.();
		},
		releaseSource: () => {
			releasedAll = true;
			for (const release of releases) release?.();
		},
	};
};

const customerKey = meteringIdentityToPartitionKey({ identity });
const freshEnvelope: SubjectRowsEnvelope = {
	...emptyEnvelope,
	customer: {
		...emptyEnvelope.customer,
		usage_limits: [],
		// Alerts ride on the customer row: a load that dropped them would fire none downstream.
		usage_alerts: [
			{
				feature_id: "messages",
				enabled: true,
				threshold: 800,
				threshold_type: "usage",
				basis: "balance",
			},
		],
	},
};
/** Lets the load run up to its next await on the source. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
		expect(scope.state.inFlightLoads.count()).toBe(1);
		releaseSource();
		const [firstState, secondState] = await Promise.all([first, second]);

		expect(sourceCalls()).toBe(1);
		expect(firstState.revision).toBe(1);
		expect(secondState).toEqual(firstState);
		expect(writer.committed).toHaveLength(1);
		expect(writer.committed[0]?.command.type).toBe("initialize");
		expect(writer.readState()?.revision).toBe(1);
		expect(scope.state.inFlightLoads.count()).toBe(0);
	});

	test("rows an evict overtook are never kept; the load reads again and keeps the fresh ones", async () => {
		const { scope, writer, sourceCalls, releaseRead } = createScope({
			initial: null,
			rows: [emptyEnvelope, freshEnvelope],
		});

		const loading = ensureSubjectState({ scope, identity });
		// The write behind this evict landed after the first read began, so what that read holds cannot be trusted.
		scope.state.inFlightLoads.overtakeCustomer({ customerKey });
		releaseRead(0);
		await settle();
		expect(writer.readState()).toBeNull();

		releaseRead(1);
		const state = await loading;

		expect(sourceCalls()).toBe(2);
		expect(state.customer?.usage_limits).toEqual([]);
		expect(state.customer?.usage_alerts).toEqual(
			freshEnvelope.customer.usage_alerts,
		);
		expect(writer.committed).toHaveLength(1);
		expect(scope.state.inFlightLoads.count()).toBe(0);
	});

	test("a command arriving during the second read joins it and sees the fresh rows", async () => {
		const { scope, sourceCalls, releaseRead } = createScope({
			initial: null,
			rows: [emptyEnvelope, freshEnvelope],
		});

		const first = ensureSubjectState({ scope, identity });
		scope.state.inFlightLoads.overtakeCustomer({ customerKey });
		releaseRead(0);
		await settle();
		const second = ensureSubjectState({ scope, identity });
		releaseRead(1);

		const [firstState, secondState] = await Promise.all([first, second]);
		expect(sourceCalls()).toBe(2);
		expect(secondState).toEqual(firstState);
		expect(secondState.customer?.usage_limits).toEqual([]);
	});

	test("an evict with no load in flight leaves the next load alone", async () => {
		const { scope, sourceCalls, releaseSource } = createScope({
			initial: null,
			rows: emptyEnvelope,
		});
		scope.state.inFlightLoads.overtakeCustomer({ customerKey });
		releaseSource();
		await ensureSubjectState({ scope, identity });
		expect(sourceCalls()).toBe(1);
	});

	test("an evict of another customer leaves this load alone", async () => {
		const { scope, sourceCalls, releaseSource } = createScope({
			initial: null,
			rows: emptyEnvelope,
		});
		const loading = ensureSubjectState({ scope, identity });
		// A customer id that extends this one must not match it.
		scope.state.inFlightLoads.overtakeCustomer({
			customerKey: `${customerKey}:x`,
		});
		releaseSource();
		await loading;
		expect(sourceCalls()).toBe(1);
	});

	test("a load overtaken on every read keeps nothing and asks the caller to retry", async () => {
		const { scope, writer, sourceCalls, releaseRead } = createScope({
			initial: null,
			rows: emptyEnvelope,
		});

		const outcome = ensureSubjectState({ scope, identity }).catch(
			(error: unknown) => error,
		);
		for (let read = 0; read < 4; read++) {
			scope.state.inFlightLoads.overtakeCustomer({ customerKey });
			releaseRead(read);
			await settle();
		}

		expect(await outcome).toBeInstanceOf(SubjectLoadOvertakenError);
		expect(sourceCalls()).toBe(4);
		expect(writer.readState()).toBeNull();
		expect(writer.committed).toHaveLength(0);
		expect(scope.state.inFlightLoads.count()).toBe(0);
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
		expect(scope.state.inFlightLoads.count()).toBe(0);
	});
});

describe("ensure subject state against the caller's answer deadline", () => {
	test("a cold load still running at the deadline answers busy, and finishes for the next caller", async () => {
		const { scope, writer, sourceCalls, releaseSource } = createScope({
			initial: null,
			rows: emptyEnvelope,
		});

		await expect(
			runWithAnswerDeadline({
				expiresAt: performance.now() + 20,
				run: () => ensureSubjectState({ scope, identity }),
			}),
		).rejects.toBeInstanceOf(SubjectLoadBusyError);
		expect(scope.state.inFlightLoads.count()).toBe(1);

		releaseSource();
		await settle();
		await settle();
		expect(writer.readFreshestState()?.revision).toBe(1);
		expect((await ensureSubjectState({ scope, identity })).revision).toBe(1);
		expect(sourceCalls()).toBe(1);
	});

	test("a caller with no deadline waits for the load however long it takes", async () => {
		const { scope, releaseSource } = createScope({
			initial: null,
			rows: emptyEnvelope,
		});
		let answered = false;
		const waiting = ensureSubjectState({ scope, identity }).then((state) => {
			answered = true;
			return state;
		});

		await new Promise<void>((resolve) => setTimeout(resolve, 40));
		expect(answered).toBe(false);
		releaseSource();
		expect((await waiting).revision).toBe(1);
	});

	test("a caller giving up at its deadline does not fail a caller without one on the same load", async () => {
		const { scope, releaseSource } = createScope({
			initial: null,
			rows: emptyEnvelope,
		});
		const patient = ensureSubjectState({ scope, identity });
		const hurried = runWithAnswerDeadline({
			expiresAt: performance.now() + 10,
			run: () => ensureSubjectState({ scope, identity }),
		});

		await expect(hurried).rejects.toBeInstanceOf(SubjectLoadBusyError);
		releaseSource();
		expect((await patient).revision).toBe(1);
	});

	test("a load that fails after its only caller gave up is not left unhandled", async () => {
		const { scope, releaseSource } = createScope({ initial: null, rows: null });
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on("unhandledRejection", onUnhandled);
		try {
			await expect(
				runWithAnswerDeadline({
					expiresAt: performance.now() + 10,
					run: () => ensureSubjectState({ scope, identity }),
				}),
			).rejects.toBeInstanceOf(SubjectLoadBusyError);
			releaseSource();
			await new Promise<void>((resolve) => setTimeout(resolve, 20));
			expect(unhandled).toEqual([]);
		} finally {
			process.off("unhandledRejection", onUnhandled);
		}
	});

	test("a cold entity of a resident customer answers busy at the deadline without failing a patient caller on the same batched read", async () => {
		const { scope } = createScope({ initial: emptyState, rows: null });
		const entityIdentity = { ...identity, entityId: "ent_1" };
		const entityEnvelope: SubjectRowsEnvelope = {
			...emptyEnvelope,
			entity: {
				id: "ent_1",
				internal_id: "ent_internal_1",
				internal_customer_id: emptyEnvelope.customer.internal_id,
				feature_id: "projects",
				org_id: identity.orgId,
				created_at: 1_700_000_000_000,
				env: AppEnv.Sandbox,
				name: null,
				deleted: false,
				internal_feature_id: "feat_projects",
			},
		};
		let entityReads = 0;
		let releaseEntityRead = (): void => undefined;
		const entityRead = new Promise<void>((resolve) => {
			releaseEntityRead = resolve;
		});
		scope.ctx.db.getEntitySubjectRows = async () => {
			entityReads += 1;
			await entityRead;
			return [entityEnvelope];
		};

		const patient = ensureSubjectState({ scope, identity: entityIdentity });
		const hurried = runWithAnswerDeadline({
			expiresAt: performance.now() + 10,
			run: () => ensureSubjectState({ scope, identity: entityIdentity }),
		});

		await expect(hurried).rejects.toBeInstanceOf(SubjectLoadBusyError);
		releaseEntityRead();
		await expect(patient).resolves.toBeDefined();
		expect(entityReads).toBe(1);
	});

	test("a resident customer answers at once, even past the deadline", async () => {
		const { scope, sourceCalls } = createScope({
			initial: { ...emptyState, revision: 3 },
			rows: null,
		});

		const state = await runWithAnswerDeadline({
			expiresAt: performance.now() - 1,
			run: () => ensureSubjectState({ scope, identity }),
		});
		expect(state.revision).toBe(3);
		expect(sourceCalls()).toBe(0);
	});
});
