import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createSubjectState,
	type MeteringIdentity,
	type SubjectState,
	type WorkerEntity,
} from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client/protocol";
import type { MeteringRecord } from "@autumn/kafka";
import type { SubjectRowsEnvelope } from "@autumn/postgres";
import { AppEnv } from "@autumn/shared";
import { track } from "../../../../src/processor/commands/track.js";
import { createAcceptedCommands } from "../../../../src/processor/common/acceptedCommands.js";
import { createSubjectHydrator } from "../../../../src/processor/subject/createSubjectHydrator.js";
import { SubjectNotFoundError } from "../../../../src/processor/subject/subjectErrors.js";
import type { PartitionProcessorScope } from "../../../../src/processor/types/partitionProcessor.js";
import { createPartitionWriter } from "../../../../src/processor/writer/createPartitionWriter.js";
import type { CommittedOutcomeAppender } from "../../../../src/processor/writer/types/partitionWriter.js";
import { openStateStore } from "../../../../src/state/openStateStore.js";
import type { StateStore } from "../../../../src/state/types/stateStore.js";
import type { WorkerDb } from "../../../../src/types/workerDb.js";
import {
	createSyntheticWorkerDb,
	createTestCatalogCache,
} from "../../../fixtures/catalog.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	testIdentity as identity,
	restoreSubjectStates,
} from "../../../fixtures/mutations.js";

const topic = "entity-subjects";
const partition = 0;
const entityIdentity: MeteringIdentity = { ...identity, entityId: "ent_42" };
const entity: WorkerEntity = {
	id: "ent_42",
	internal_id: "ent_internal_42",
	internal_customer_id: "cus_internal_1",
	feature_id: "seats",
};
const seatsRow = {
	...createCustomerEntitlement({ id: "seats_ent_42", featureId: "seats" }),
	internal_entity_id: entity.internal_id,
};

const customerState = (): SubjectState =>
	createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			createCustomerEntitlement({ id: "messages_monthly" }),
		],
	});

/** Postgres as the worker sees it: the entity's own rows for ent_42, nothing else. */
const entityEnvelope: SubjectRowsEnvelope = {
	customer: {
		internal_id: "cus_internal_1",
		id: identity.customerId,
		org_id: identity.orgId,
		env: AppEnv.Sandbox,
		config: null,
	},
	customer_products: [],
	customer_entitlements: [
		{
			...seatsRow,
			feature_id: "seats",
			separate_interval: false,
			cache_version: 0,
		},
	],
	rollovers: [],
	entity: {
		...entity,
		org_id: identity.orgId,
		created_at: 0,
		env: identity.env,
		name: null,
		deleted: false,
		internal_feature_id: "feat_seats",
	},
};

/** Holds appends while `hold` is on; `release` commits everything held so far with contiguous offsets. */
class ControlledAppender implements CommittedOutcomeAppender {
	readonly batches: MeteringRecord[][] = [];
	hold = false;
	private held: Array<() => void> = [];
	private nextOffset = 0n;

	appendCommitted({
		outcomes,
	}: {
		topic: string;
		partition: number;
		outcomes: readonly MeteringRecord[];
	}): Promise<{ baseOffset: bigint }> {
		this.batches.push([...outcomes]);
		const baseOffset = this.nextOffset;
		this.nextOffset += BigInt(outcomes.length);
		if (!this.hold) return Promise.resolve({ baseOffset });
		return new Promise((resolve) => {
			this.held.push(() => resolve({ baseOffset }));
		});
	}

	release(): void {
		this.hold = false;
		for (const resolve of this.held.splice(0)) resolve();
	}
}

const waitForTurn = async () => {
	await new Promise<void>((resolve) => setImmediate(resolve));
	await new Promise<void>((resolve) => setImmediate(resolve));
};

const createFixture = () => {
	const directory = mkdtempSync(join(tmpdir(), "entity-subjects-"));
	const store: StateStore = openStateStore({
		databasePath: join(directory, "s.sqlite"),
	});
	store.initializePartition({ topic, partition, nextOffset: 0n });
	restoreSubjectStates({ store, topic, partition, states: [customerState()] });

	const subjectRowsCalls: MeteringIdentity[] = [];
	const db: WorkerDb = {
		getSubjectRows: async ({ identity: requested }) => {
			subjectRowsCalls.push(requested);
			return requested.entityId === entity.id ? entityEnvelope : null;
		},
		getCatalogRows: createSyntheticWorkerDb().getCatalogRows,
	};
	const appender = new ControlledAppender();
	const limits = {
		maxBatchSize: 100,
		maxPendingCommands: 100,
		maxPendingCommandsPerCustomer: 100,
	};
	const receiptPolicy = {
		retentionMs: 86_400_000,
		now: () => 1_700_000_000_000,
	};
	const writer = createPartitionWriter({
		ctx: { stateStore: store, appender, receiptPolicy },
		config: { topic, partition, limits },
	});
	const catalogCache = createTestCatalogCache({ db });
	const scope: PartitionProcessorScope = {
		ctx: {
			stateStore: store,
			appender,
			db,
			catalogCache,
			receiptPolicy,
			assertCanRead: () => undefined,
			config: { topic, partition, writerLimits: limits },
			writer,
			subjectHydrator: createSubjectHydrator({
				ctx: { catalogCache, db, writer, receiptPolicy },
			}),
		},
		accepted: createAcceptedCommands(),
	};
	return {
		store,
		appender,
		subjectRowsCalls,
		track: (command: Parameters<typeof createTrackCommand>[0]) =>
			track({ scope, command: createTrackCommand(command) }),
		close: () => {
			store.close();
			rmSync(directory, { recursive: true, force: true });
		},
	};
};

describe("entity subjects", () => {
	test("a track for a cold entity hydrates the entity at the customer's revision, then deducts", async () => {
		const fixture = createFixture();
		try {
			const decision = await fixture.track({
				identity: entityIdentity,
				featureId: "seats",
				value: 4,
			});

			expect(fixture.subjectRowsCalls).toEqual([entityIdentity]);
			expect(decision).toMatchObject({ state: { revision: 2 } });
			expect(
				fixture.appender.batches
					.flat()
					.map((record) => [
						record.command.type,
						record.identity.entityId,
						record.revision.before,
					]),
			).toEqual([
				["initialize", "ent_42", 0],
				["track", "ent_42", 1],
			]);
			expect(
				fixture.store.readOwnState({ identity: entityIdentity })
					?.customerEntitlements,
			).toEqual([{ ...seatsRow, balance: 6 }]);
			expect(fixture.store.readOwnState({ identity })?.revision).toBe(2);
			expect(fixture.store.readOwnState({ identity })?.entity).toBeNull();

			await fixture.track({
				identity: entityIdentity,
				featureId: "seats",
				value: 1,
				commandId: "cmd_2",
			});
			expect(fixture.subjectRowsCalls).toHaveLength(1);
		} finally {
			fixture.close();
		}
	});

	/** The balance left on the rows this track drew from. */
	const drawnBalanceOf = ({ result, state }: TrackReply): number => {
		const drawn = new Set(result.deltas.map((delta) => delta.id));
		return state.customerEntitlements
			.filter((row) => drawn.has(row.id))
			.reduce((total, row) => total + row.balance, 0);
	};

	test("pending customer and entity mutations project per subject, so each sees the other's revision", async () => {
		const fixture = createFixture();
		try {
			await fixture.track({
				identity: entityIdentity,
				featureId: "seats",
				value: 1,
				commandId: "warm",
			});
			fixture.appender.hold = true;

			const customerTrack = fixture.track({ value: 2, commandId: "cus_track" });
			await waitForTurn();
			const entityTrack = fixture.track({
				identity: entityIdentity,
				featureId: "seats",
				value: 3,
				commandId: "ent_track",
			});
			await waitForTurn();
			const secondCustomerTrack = fixture.track({
				value: 1,
				commandId: "cus_track_2",
			});
			await waitForTurn();
			expect(fixture.store.readOwnState({ identity })?.revision).toBe(2);

			fixture.appender.release();
			const decisions = await Promise.all([
				customerTrack,
				entityTrack,
				secondCustomerTrack,
			]);

			expect(
				decisions.map((decision) => [
					decision.state.revision,
					drawnBalanceOf(decision),
				]),
			).toEqual([
				[3, 8],
				[4, 6],
				[5, 7],
			]);
			expect(fixture.store.readOwnState({ identity })?.revision).toBe(5);
			expect(
				fixture.store
					.readState({ identity: entityIdentity })
					?.customerEntitlements.map((row) => [row.id, row.balance]),
			).toEqual([
				["messages_monthly", 7],
				["seats_ent_42", 6],
			]);
		} finally {
			fixture.close();
		}
	});

	test("an entity the source does not know is its own not-found", async () => {
		const fixture = createFixture();
		try {
			const unknown = { ...identity, entityId: "ent_99" };
			const failure = fixture
				.track({ identity: unknown, featureId: "seats" })
				.then(
					() => null,
					(error: unknown) => error,
				);

			const error = await failure;
			expect(error).toBeInstanceOf(SubjectNotFoundError);
			expect(error instanceof SubjectNotFoundError && error.identity).toEqual(
				unknown,
			);
			expect(fixture.appender.batches).toEqual([]);
		} finally {
			fixture.close();
		}
	});
});
