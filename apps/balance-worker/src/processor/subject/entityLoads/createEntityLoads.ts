import {
	type MeteringIdentity,
	meteringIdentityToPartitionKey,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { SUBJECT_ROW_LIMITS } from "@autumn/postgres";
import { timeSync } from "../../../logging/eventLoopStalls/syncSections.js";
import { keepSubjectBaseline } from "../actions/ensureSubject/keepSubjectBaseline.js";
import { loadSubjectState } from "../actions/ensureSubject/loadSubjectState.js";
import { subjectEnvelopeToState } from "../actions/ensureSubject/readSubjectBaseline.js";
import type { InFlightLoad } from "../inFlightLoads/types/inFlightLoad.js";
import { SubjectNotFoundError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";
import type { EntityLoads } from "./types/entityLoads.js";

const ADOPT_CHUNK = 25;

type Settle = {
	promise: Promise<SubjectState>;
	resolve: (state: SubjectState) => void;
	reject: (cause: unknown) => void;
};

type Waiting = {
	identity: MeteringIdentity;
	load: InFlightLoad;
	settle: Settle;
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

const settleFromBatch = async ({
	scope,
	waiting,
	baseline,
	occurredAt,
}: {
	scope: SubjectScope;
	waiting: Waiting;
	baseline: SubjectState | null;
	occurredAt: number;
}): Promise<void> => {
	try {
		if (waiting.load.overtaken) {
			waiting.load.overtaken = false;
			waiting.settle.resolve(
				await loadSubjectState({
					scope,
					identity: waiting.identity,
					load: waiting.load,
				}),
			);
			return;
		}
		if (!baseline)
			throw new SubjectNotFoundError({ identity: waiting.identity });
		waiting.settle.resolve(
			await keepSubjectBaseline({
				scope,
				identity: waiting.identity,
				baseline,
				occurredAt,
			}),
		);
	} catch (cause) {
		waiting.settle.reject(cause);
	}
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
			await settleFromBatch({ scope, waiting, baseline, occurredAt });
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
		load,
	}: {
		identity: MeteringIdentity;
		load: InFlightLoad;
	}): Promise<SubjectState> => {
		const customerKey = meteringIdentityToPartitionKey({ identity });
		const queue = queues.get(customerKey) ?? {
			running: false,
			waiting: new Map(),
		};
		queues.set(customerKey, queue);
		const waiting: Waiting = {
			identity,
			load,
			settle: Promise.withResolvers<SubjectState>(),
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
				start: ({ load }) => enqueue({ identity, load }),
			}),
	};
};
