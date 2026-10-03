import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { SUBJECT_ROW_LIMITS } from "@autumn/postgres";
import { timeSync } from "../../../logging/eventLoopStalls/syncSections.js";
import { subjectEnvelopeToState } from "../actions/ensureSubject/readSubjectBaseline.js";
import { SubjectNotFoundError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";
import type { SubjectRead } from "../types/subjectRead.js";
import type { EntityLoads } from "./types/entityLoads.js";

const ADOPT_CHUNK = 25;

type Waiting = {
	identity: MeteringIdentity;
	settle: ReturnType<typeof Promise.withResolvers<SubjectRead>>;
};

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

const runBatch = async ({
	scope,
	batch,
}: {
	scope: SubjectScope;
	batch: Waiting[];
}): Promise<void> => {
	const first = batch[0];
	if (!first) return;
	const occurredAt = scope.ctx.receiptPolicy.now();
	let envelopes: Awaited<
		ReturnType<SubjectScope["ctx"]["db"]["getEntitySubjectRows"]>
	>;
	try {
		envelopes = await scope.ctx.db.getEntitySubjectRows({
			identity: { ...first.identity, entityId: null },
			entityIds: batch.flatMap((waiting) =>
				waiting.identity.entityId ? [waiting.identity.entityId] : [],
			),
			asOfTimestampMs: occurredAt,
		});
	} catch (cause) {
		for (const waiting of batch) waiting.settle.reject(cause);
		return;
	}
	const envelopeByEntity = new Map(
		envelopes.flatMap((envelope) =>
			envelope.entity
				? [
						[envelope.entity.id, envelope] as const,
						[envelope.entity.internal_id, envelope] as const,
					]
				: [],
		),
	);
	for (const chunk of chunksOf({ items: batch, size: ADOPT_CHUNK })) {
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
		for (const { waiting, baseline } of baselines)
			settleFromBatch({ waiting, baseline, occurredAt });
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
	}: {
		identity: MeteringIdentity;
	}): Promise<SubjectRead> => {
		const customerKey = meteringIdentityToPartitionKey({ identity });
		const queue = queues.get(customerKey) ?? {
			running: false,
			waiting: new Map(),
		};
		queues.set(customerKey, queue);
		const waiting: Waiting = {
			identity,
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
		load: ({ identity }) =>
			scopeOf().state.inFlightLoads.join({
				subjectKey: meteringIdentityToSubjectKey({ identity }),
				customerKey: meteringIdentityToPartitionKey({ identity }),
				start: () => enqueue({ identity }),
			}),
	};
};
