import {
	type Catalog,
	mergeCatalogs,
	mergeSubjectStates,
	type SubjectState,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import {
	CannotAnswerError,
	type ForwardReason,
} from "../../../lib/forward/cannotAnswerError.js";
import type { JournalEntry } from "../../../state/journal/types/journal.js";
import type { SharedCatalog } from "../../../state/types/catalogStore.js";
import {
	isDeletedSubject,
	type StoredSubject,
} from "../../../state/types/storedSubject.js";
import { timeStage } from "../../../threads/stats/stageClock.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import {
	appliedOf,
	type FoldRebuilt,
	foldAcrossPush,
} from "./foldAcrossPush.js";
import { freshestCatalog } from "./freshestCatalog.js";
import { replayOwed } from "./replayOwed.js";
import type { ReplayBase, ViewFold } from "./types/viewFold.js";

/** The API answers, and the subject is pulled beside it so a later check can be answered here. */
const subjectNotStored = ({
	ctx,
	customerId,
	entityId,
	reason,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	entityId: string | null;
	reason: Extract<
		ForwardReason,
		| "customer_not_stored"
		| "customer_deleted"
		| "entity_not_stored"
		| "entity_deleted"
		| "entity_stale"
	>;
}): CannotAnswerError => {
	ctx.subjectPulls.request({ customerId, entityId });
	return new CannotAnswerError({ reason });
};

/** A deleted part is a miss no copy read before the delete can fill: the API answers, and a pull finds it if it is back. */
const readLivePart = ({
	ctx,
	customerId,
	entityId,
	part,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	entityId: string | null;
	part: "customer" | "entity";
}): StoredSubject => {
	const row = ctx.sqliteStore.readSubject({
		customerId,
		entityId: part === "customer" ? null : entityId,
	});
	if (row && !isDeletedSubject(row)) return row;
	throw subjectNotStored({
		ctx,
		customerId,
		entityId,
		reason: row ? `${part}_deleted` : `${part}_not_stored`,
	});
};

/** The customer's own rows, and the entity's own beside them when the request is for an entity. */
const readStoredParts = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	entityId: string | null;
}): { customer: StoredSubject; entity: StoredSubject | null } => {
	const customer = readLivePart({
		ctx,
		customerId,
		entityId,
		part: "customer",
	});
	if (entityId === null) return { customer, entity: null };

	const entity = readLivePart({ ctx, customerId, entityId, part: "entity" });
	// Read from before the customer's latest evict, the entity may still hold rows that evict replaced.
	const isEntityCurrent = entity.logOffset >= customer.customerVersion;
	if (!isEntityCurrent)
		throw subjectNotStored({
			ctx,
			customerId,
			entityId,
			reason: "entity_stale",
		});
	return { customer, entity };
};

/** Only appends happened since the fold: the journal grew its very array, or the fold applied none (a first entry starts one). */
const isAppendedTo = ({
	owed,
	fold,
}: {
	owed: readonly JournalEntry[];
	fold: ViewFold;
}): boolean =>
	(owed === fold.owed || fold.applied === 0) && owed.length > fold.applied;

/** Keyed by the copy the request is for (the entity's, or the customer's), so a copy the store replaces takes its view with it. */
const subjectJoinCache = new WeakMap<StoredSubject, ViewFold>();
/** A customer's own fold, keyed by the last entry it applied: it outlives the copy a push replaces, and leaves with that entry. */
const foldByLastEntry = new WeakMap<JournalEntry, ViewFold>();

/** One line per thread this often names why folds are replayed, so a busy thread cannot flood the logs. */
const REBUILT_WARN_EVERY_MS = 60_000;
/** Enough of each side to tell which field differs and how; a customer's atom_seqs map is logged whole. */
const LOGGED_VALUE_CHARS = 80;
const LOGGED_ATOM_SEQS_CHARS = 400;

type RebuildReason = FoldRebuilt["rebuiltFor"] | "noFold";

/** Pushes that replaced a customer's copy while it owed: the fold continued, or replayed from the push, by why. Module state is the thread's own. */
let viewFoldKept = 0;
const viewFoldRebuilt: Record<RebuildReason, number> = {
	noFold: 0,
	trim: 0,
	catalog: 0,
	state: 0,
};
let rebuiltWarnedAt = Number.NEGATIVE_INFINITY;

export const readViewFoldThreadStats = () => ({
	viewFoldKept,
	viewFoldRebuilt: Object.values(viewFoldRebuilt).reduce(
		(sum, count) => sum + count,
		0,
	),
	viewFoldRebuiltNoFold: viewFoldRebuilt.noFold,
	viewFoldRebuiltTrim: viewFoldRebuilt.trim,
	viewFoldRebuiltCatalog: viewFoldRebuilt.catalog,
	viewFoldRebuiltState: viewFoldRebuilt.state,
});

const loggedValueOf = (
	value: unknown,
	chars: number = LOGGED_VALUE_CHARS,
): string => (JSON.stringify(value) ?? "undefined").slice(0, chars);

/** Counts why the fold was replayed; where Autumn's copy differs is logged once a minute per thread. */
const countRebuilt = ({
	ctx,
	customerId,
	rebuilt,
	fold,
	customer,
	owed,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	rebuilt: FoldRebuilt | null;
	fold: ViewFold | null;
	customer: StoredSubject;
	owed: readonly JournalEntry[];
}): void => {
	viewFoldRebuilt[rebuilt?.rebuiltFor ?? "noFold"]++;
	const difference = rebuilt?.difference;
	const now = performance.now();
	if (!difference || now - rebuiltWarnedAt < REBUILT_WARN_EVERY_MS) return;
	rebuiltWarnedAt = now;
	ctx.logger.warn(
		{
			type: "atom_view_fold_rebuilt",
			data: {
				customerId,
				reason: rebuilt.rebuiltFor,
				path: difference.path,
				held: loggedValueOf(difference.left),
				pushed: loggedValueOf(difference.right),
				// Each copy's customer row says how far Autumn had seen each journal; and which entries the push trimmed from the fold.
				writerId: ctx.journal.writerId,
				trimmedSeqs: (fold ? appliedOf({ fold }) : [])
					.filter((entry) => !owed.includes(entry))
					.map(({ seq }) => seq),
				owedFirstSeq: owed[0]?.seq ?? null,
				heldCustomerAtomSeqs: loggedValueOf(
					fold?.customer.state.customer.atom_seqs ?? null,
					LOGGED_ATOM_SEQS_CHARS,
				),
				pushedCustomerAtomSeqs: loggedValueOf(
					customer.state.customer.atom_seqs ?? null,
					LOGGED_ATOM_SEQS_CHARS,
				),
			},
		},
		`A push replaced ${customerId}'s copy with more than its own deductions acknowledged (${rebuilt.rebuiltFor} differs at ${difference.path}); its view was replayed`,
	);
};

/** The customer's fold whose last applied entry is still owed: the newest one, so found from the end. */
const foldStillOwed = ({
	owed,
}: {
	owed: readonly JournalEntry[];
}): ViewFold | null => {
	for (let index = owed.length - 1; index >= 0; index--) {
		const fold = foldByLastEntry.get(owed[index] as JournalEntry);
		if (fold) return fold;
	}
	return null;
};

/** The customer's fold moves to the entry it now ends on, so a customer holds one fold at most. */
const keepFold = ({
	fold,
	previous,
}: {
	fold: ViewFold;
	previous: ViewFold | null;
}): void => {
	const previousLast = previous?.owed[previous.applied - 1];
	if (previousLast) foldByLastEntry.delete(previousLast);
	const last = fold.owed[fold.applied - 1];
	if (last) foldByLastEntry.set(last, fold);
};

const joinCurrentSubject = ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: SlotProcessorContext;
	customerId: string;
	entityId: string | null;
}): CurrentSubject => {
	const { customer, entity } = readStoredParts({ ctx, customerId, entityId });
	const shared = ctx.catalogStore.read();
	const owed = ctx.journal.owed({ customerId });
	const target = entity ?? customer;
	const joined = subjectJoinCache.get(target);
	const isSameCopy = joined?.customer === customer && joined.shared === shared;
	if (isSameCopy && joined.owed === owed && joined.applied === owed.length)
		return joined.current;
	const catalog = joinedCatalogOf({ customer, entity, shared });
	// A customer's own fold survives a new copy: a push that only acknowledged its deductions replays nothing.
	const isOwedOnNewCopy = !entity && !isSameCopy && owed.length > 0;
	const carried = isOwedOnNewCopy ? foldStillOwed({ owed }) : null;
	const acrossPush = carried
		? foldAcrossPush({ fold: carried, customer, owed, catalog })
		: null;
	const carriedBase =
		acrossPush && "kept" in acrossPush ? acrossPush.kept : null;
	if (isOwedOnNewCopy && carriedBase) viewFoldKept++;
	else if (isOwedOnNewCopy)
		countRebuilt({
			ctx,
			customerId,
			rebuilt: acrossPush && "rebuiltFor" in acrossPush ? acrossPush : null,
			fold: carried,
			customer,
			owed,
		});
	// An append continues the cached fold, so n deductions between pushes cost n engine steps, not n²/2.
	const base: ReplayBase =
		carriedBase ??
		(isSameCopy && isAppendedTo({ owed, fold: joined })
			? {
					state: joined.customerState,
					applied: joined.applied,
					fullSubject: entity ? null : joined.current.fullSubject,
				}
			: { state: customer.state, applied: 0, fullSubject: null });
	const { current, customerState } = joinSubject({
		customer,
		entity,
		shared,
		owed,
		base,
		catalog,
		entityId,
	});
	const fold: ViewFold = {
		customer,
		shared,
		owed,
		applied: owed.length,
		customerState,
		current,
	};
	subjectJoinCache.set(target, fold);
	if (!entity) keepFold({ fold, previous: isSameCopy ? joined : carried });
	return current;
};

/** The part read later is merged last, so where both hold a row its copy is the one kept. */
const joinedCatalogOf = ({
	customer,
	entity,
	shared,
}: {
	customer: StoredSubject;
	entity: StoredSubject | null;
	shared: SharedCatalog | null;
}): Catalog => {
	const parts = entity ? [customer, entity] : [customer];
	const partsOldestFirst = [...parts].sort(
		(left, right) => left.readAt - right.readAt,
	);
	return mergeCatalogs({
		catalogs: partsOldestFirst.map((stored) =>
			freshestCatalog({ stored, shared }),
		),
	});
};

const joinSubject = ({
	customer,
	entity,
	shared,
	owed,
	base,
	catalog,
	entityId,
}: {
	customer: StoredSubject;
	entity: StoredSubject | null;
	shared: SharedCatalog | null;
	owed: readonly JournalEntry[];
	base: ReplayBase;
	catalog: Catalog;
	entityId: string | null;
}): { current: CurrentSubject; customerState: SubjectState } => {
	// Only a customer's own deductions are owed, and they move only the customer's own rows.
	const unapplied = owed.slice(base.applied);
	const customerState =
		unapplied.length === 0
			? base.state
			: replayOwed({
					owed: unapplied,
					state: base.state,
					catalog,
					fullSubject: base.fullSubject,
				});

	const current: CurrentSubject = {
		fullSubject: subjectStateToFullSubject({
			state: mergeSubjectStates({
				customer: customerState,
				entity: entity?.state ?? null,
			}),
			catalog,
			entityId,
		}),
		catalog,
		// The joined catalog already holds the freshest copy of each feature the subject references.
		features: Object.values({
			...shared?.catalog.features,
			...catalog.features,
		}),
		org: customer.org,
	};
	return { current, customerState };
};

/**
 * The subject a request is decided on: as Autumn last sent it, with what the Atom owes Autumn for the customer replayed
 * on top; for an entity, the customer's rows and its own as one. Joined once per change to its parts, not per check.
 * A customer or entity Atom does not hold is left to the API.
 */
export const readCurrentSubject = (
	params: Parameters<typeof joinCurrentSubject>[0],
): CurrentSubject => timeStage("viewRender", () => joinCurrentSubject(params));
