import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { SUBJECT_ROW_LIMITS, type SubjectRowsEnvelope } from "@autumn/postgres";
import { timeSync } from "../../../logging/eventLoopStalls/syncSections.js";
import { subjectEnvelopeToState } from "../actions/ensureSubject/readSubjectBaseline.js";
import { verifySnapshot } from "../snapshotLoader/actions/verifySnapshot.js";
import { snapshotProbeOf } from "../snapshotLoader/rules/snapshotProbeOf.js";
import { SubjectNotFoundError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";
import type { SubjectRead } from "../types/subjectRead.js";
import {
	type EntitySnapshotRows,
	probeEntitySnapshots,
} from "./actions/probeEntitySnapshots.js";
import type {
	EntityLoads,
	WaitingEntity as Waiting,
} from "./types/entityLoads.js";

const ADOPT_CHUNK = 25;

type CustomerQueue = {
	running: boolean;
	waiting: Map<string, Waiting>;
};

const yieldToEventLoop = (): Promise<void> =>
	new Promise((resolve) => setImmediate(resolve));

const chunksOf = <Item>({
	items,
	size,
}: {
	items: readonly Item[];
	size: number;
}): Item[][] => {
	const chunks: Item[][] = [];
	for (let start = 0; start < items.length; start += size)
		chunks.push(items.slice(start, start + size));
	return chunks;
};

/** Each waiting entity gets its own rows at the batch's read time, or not-found; what to do with them is the caller's. */
const settleFromBatch = ({
	waiting,
	baseline,
	occurredAt,
}: {
	waiting: Waiting;
	baseline: SubjectState | null;
	occurredAt: number;
}): void => {
	if (!baseline)
		waiting.settle.reject(
			new SubjectNotFoundError({ identity: waiting.identity }),
		);
	else waiting.settle.resolve({ baseline, baselineAt: occurredAt });
};

/** The batch's rows read whole, by entity id; a read that fails rejects every entity waiting on it. */
const readEntityRows = async ({
	scope,
	batch,
	occurredAt,
}: {
	scope: SubjectScope;
	batch: readonly Waiting[];
	occurredAt: number;
}): Promise<Map<string | null, SubjectRowsEnvelope>> => {
	const first = batch[0];
	if (!first) return new Map();
	const envelopes = await scope.ctx.db.getEntitySubjectRows({
		identity: { ...first.identity, entityId: null },
		entityIds: batch.flatMap((waiting) =>
			waiting.identity.entityId ? [waiting.identity.entityId] : [],
		),
		asOfTimestampMs: occurredAt,
	});
	return new Map(
		envelopes.flatMap((envelope) =>
			envelope.entity
				? [
						[envelope.entity.id, envelope] as const,
						[envelope.entity.internal_id, envelope] as const,
					]
				: [],
		),
	);
};

/**
 * Two statements at most per batch: the probe for every entity that may take a row, then the rows for the rest. A served
 * entity settles from its row; a verified one settles from the rows and logs where its row disagreed.
 */
const runBatch = async ({
	scope,
	batch,
}: {
	scope: SubjectScope;
	batch: Waiting[];
}): Promise<void> => {
	const occurredAt = scope.ctx.receiptPolicy.now();
	const probe = snapshotProbeOf({ scope, occurredAt });
	let rows: EntitySnapshotRows;
	let envelopeByEntity: Map<string | null, SubjectRowsEnvelope>;
	try {
		rows = await probeEntitySnapshots({ scope, batch, probe });
		const served = probe === "serve" ? rows : new Map<Waiting, SubjectState>();
		for (const [waiting, row] of served)
			waiting.settle.resolve({ baseline: row, baselineAt: occurredAt });
		envelopeByEntity = await readEntityRows({
			scope,
			batch: batch.filter((waiting) => !served.has(waiting)),
			occurredAt,
		});
	} catch (cause) {
		for (const waiting of batch) waiting.settle.reject(cause);
		return;
	}
	const reading = batch.filter(
		(waiting) => probe !== "serve" || !rows.has(waiting),
	);
	for (const chunk of chunksOf({ items: reading, size: ADOPT_CHUNK })) {
		const baselines = timeSync({ label: "subject.hydrate.parse" }, () =>
			chunk.map((waiting) => {
				const envelope = waiting.identity.entityId
					? envelopeByEntity.get(waiting.identity.entityId)
					: undefined;
				return {
					waiting,
					baseline: envelope
						? subjectEnvelopeToState({ identity: waiting.identity, envelope })
						: null,
				};
			}),
		);
		for (const { waiting, baseline } of baselines) {
			const row = rows.get(waiting);
			if (row && baseline)
				verifySnapshot({
					scope,
					identity: waiting.identity,
					snapshot: row,
					baseline,
				});
			settleFromBatch({ waiting, baseline, occurredAt });
		}
		await yieldToEventLoop();
	}
};

/** Cold entity loads of one customer go out together: the first query leaves once the current event-loop turn is over, and requests arriving while it reads form the next one. */
export const createEntityLoads = ({
	scopeOf,
	maxEntitiesPerLoad = SUBJECT_ROW_LIMITS.entitiesPerLoad,
}: {
	scopeOf: () => SubjectScope;
	maxEntitiesPerLoad?: number;
}): EntityLoads => {
	const queues = new Map<string, CustomerQueue>();

	const drain = async ({
		customerKey,
		queue,
	}: {
		customerKey: string;
		queue: CustomerQueue;
	}): Promise<void> => {
		queue.running = true;
		try {
			while (queue.waiting.size > 0) {
				const batch = [...queue.waiting.values()].slice(0, maxEntitiesPerLoad);
				for (const waiting of batch)
					queue.waiting.delete(
						meteringIdentityToSubjectKey({ identity: waiting.identity }),
					);
				await runBatch({ scope: scopeOf(), batch });
			}
		} finally {
			queue.running = false;
			if (queue.waiting.size === 0) queues.delete(customerKey);
		}
	};

	const enqueue = ({
		identity,
		rowsOnly,
	}: {
		identity: MeteringIdentity;
		rowsOnly: boolean;
	}): Promise<SubjectRead> => {
		const customerKey = meteringIdentityToPartitionKey({ identity });
		const queue = queues.get(customerKey) ?? {
			running: false,
			waiting: new Map(),
		};
		queues.set(customerKey, queue);
		const waiting: Waiting = {
			identity,
			rowsOnly,
			settle: Promise.withResolvers<SubjectRead>(),
		};
		queue.waiting.set(meteringIdentityToSubjectKey({ identity }), waiting);
		if (!queue.running) {
			queue.running = true;
			setImmediate(() => void drain({ customerKey, queue }));
		}
		return waiting.settle.promise;
	};

	return {
		load: ({ identity, rowsOnly }) =>
			scopeOf().state.inFlightLoads.join({
				subjectKey: meteringIdentityToSubjectKey({ identity }),
				customerKey: meteringIdentityToPartitionKey({ identity }),
				start: () => enqueue({ identity, rowsOnly }),
			}),
	};
};
