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
import type { JournalEntry } from "../../../state/journal/types/journal.js";

/** The customer's own rows and those of each entity an owed entry moved, as the replay leaves them. */
export type SubjectParts = {
	customer: SubjectState;
	entities: ReadonlyMap<string, SubjectState>;
};

/** The entity an owed entry deducts or settles on; null for the customer's own, and for a finalize left to Autumn. */
export const owedEntityIdOf = ({ command }: JournalEntry): string | null =>
	command.type === "undecidedFinalize" ? null : command.identity.entityId;

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

/**
 * The parts with each owed command applied as the balance worker applies it: decided on the rows so far (an entity's on
 * the customer's rows and its own as one, split back as the worker stores them), then applied. A command the worker would
 * refuse moves nothing here either, nor does a finalize left to the worker to decide, nor one for an entity not held.
 */
export const replayOwed = ({
	owed,
	parts,
	catalog,
	entityPartOf,
	fullSubject: customerFullSubject = null,
	onApplied,
}: {
	owed: readonly JournalEntry[];
	parts: SubjectParts;
	/** Covers the customer and every entity the owed entries name. */
	catalog: Catalog;
	/** An entity's own rows as the Atom holds them; null when it holds no live copy. */
	entityPartOf: (entityId: string) => SubjectState | null;
	/** `parts.customer` already joined to `catalog`, when a cached view holds it: the first step need not build it again. */
	fullSubject?: WorkerFullSubject | null;
	/** Told each mutation applied, for a caller that keeps what a step wrote, such as a lock's row. */
	onApplied?: (mutation: SubjectStateMutation) => void;
}): SubjectParts => {
	let current = parts;
	for (const entry of owed) {
		const { command } = entry;
		if (command.type === "undecidedFinalize") continue;
		const entityId = owedEntityIdOf(entry);
		const entity =
			entityId === null
				? null
				: (current.entities.get(entityId) ?? entityPartOf(entityId));
		if (entityId !== null && !entity) continue;
		const state = mergeSubjectStates({ customer: current.customer, entity });
		const fullSubject =
			state === parts.customer && customerFullSubject
				? customerFullSubject
				: subjectStateToFullSubject({ state, catalog, entityId });
		let next: SubjectState;
		try {
			const mutation = computeOwed({ fullSubject, command });
			onApplied?.(mutation);
			next = applyMutation({ state, mutation });
		} catch (error) {
			if (isRefusedForGood(error)) continue;
			throw error;
		}
		if (entityId === null) {
			current = { customer: next, entities: current.entities };
			continue;
		}
		const split = splitSubjectState({ state: next });
		const entities = new Map(current.entities);
		if (split.entity) entities.set(entityId, split.entity);
		current = { customer: split.customer, entities };
	}
	return current;
};
