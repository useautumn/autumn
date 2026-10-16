import {
	applyMutation,
	type Catalog,
	computeFinalize,
	computeTrack,
	type FinalizeCommand,
	LockAlreadyExistsError,
	LockNotFoundError,
	mergeSubjectStates,
	type SubjectState,
	type SubjectStateMutation,
	splitSubjectState,
	subjectStateToFullSubject,
	type TrackCommand,
	UnsupportedCommandError,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import { seenSeqOf } from "../../../state/journal/seenSeqOf.js";
import type { JournalEntry } from "../../../state/journal/types/journal.js";

/** An entity's rows as the Atom holds them, with the catalog the customer's rows and these join to. */
export type SubjectPart = { state: SubjectState; catalog: Catalog };

/** The customer's own rows, and those of each entity an owed entry named, as the replay leaves them. */
export type SubjectParts = {
	customer: SubjectState;
	entities: ReadonlyMap<string, SubjectPart>;
};

export const NO_ENTITY_PARTS: ReadonlyMap<string, SubjectPart> = new Map();

const computeOwed = ({
	fullSubject,
	command,
}: {
	fullSubject: WorkerFullSubject;
	command: TrackCommand | FinalizeCommand;
}): SubjectStateMutation =>
	command.type === "finalize"
		? computeFinalize({ fullSubject, command })
		: computeTrack({ fullSubject, command });

/** What the worker refuses for good moves nothing: a feature nothing funds, a lock_id already open, a lock already settled. */
const isRefusedForGood = (error: unknown): boolean =>
	error instanceof UnsupportedCommandError ||
	error instanceof LockAlreadyExistsError ||
	error instanceof LockNotFoundError;

/** Whether the copy's own push has yet to show the entry applied: only then does the entry still move its rows. */
const isBehind = ({
	state,
	entry,
}: {
	state: SubjectState;
	entry: JournalEntry;
}): boolean =>
	entry.seq >
	seenSeqOf({ atomSeqs: state.customer.atom_seqs, writerId: entry.writerId });

/**
 * Each owed command applied as the worker applies it: on the customer's rows and its entity's as one, split back as
 * they are stored. Each state keeps only what its own push has not shown applied, so a customer copy pushed past an
 * entity's entry is not moved by it again while the entity's copy still is. What the worker refuses, a finalize left
 * to it, or an entity not held moves nothing.
 */
export const replayOwed = ({
	owed,
	parts,
	catalog,
	entityCopyOf,
	fullSubject: customerFullSubject = null,
	onApplied,
}: {
	owed: readonly JournalEntry[];
	parts: SubjectParts;
	/** What the customer's rows join to; an entity's step joins to its part's catalog instead. */
	catalog: Catalog;
	/** An entity's copy as the Atom holds it, the first time an entry names it; null when it holds no live copy. */
	entityCopyOf: (entityId: string) => SubjectPart | null;
	/** `parts.customer` already joined to `catalog`, when a cached view holds it: the first step need not build it again. */
	fullSubject?: WorkerFullSubject | null;
	/** Told each mutation applied, for a caller that keeps what a step wrote, such as a lock's row. */
	onApplied?: (mutation: SubjectStateMutation) => void;
}): SubjectParts => {
	let { customer } = parts;
	const entities = new Map(parts.entities);
	for (const entry of owed) {
		const { command } = entry;
		if (command.type === "undecidedFinalize") continue;
		const { entityId } = command.identity;
		const entity =
			entityId === null
				? null
				: (entities.get(entityId) ?? entityCopyOf(entityId));
		if (entityId !== null && !entity) continue;
		const movesCustomer = isBehind({ state: customer, entry });
		const movesEntity =
			entity !== null && isBehind({ state: entity.state, entry });
		if (!movesCustomer && !movesEntity) continue;

		const state = mergeSubjectStates({ customer, entity: entity?.state });
		const fullSubject =
			state === parts.customer && customerFullSubject
				? customerFullSubject
				: subjectStateToFullSubject({
						state,
						catalog: entity?.catalog ?? catalog,
						entityId,
					});
		let next: SubjectState;
		try {
			const mutation = computeOwed({ fullSubject, command });
			onApplied?.(mutation);
			next = applyMutation({ state, mutation });
		} catch (error) {
			if (isRefusedForGood(error)) continue;
			throw error;
		}
		const split = entity
			? splitSubjectState({ state: next })
			: { customer: next, entity: null };
		if (movesCustomer) customer = split.customer;
		if (movesEntity && entity && entityId && split.entity)
			entities.set(entityId, { ...entity, state: split.entity });
	}
	return { customer, entities };
};
