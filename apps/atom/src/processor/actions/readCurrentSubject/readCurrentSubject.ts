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
import { deepFreeze } from "../../../state/deepFreeze.js";
import type { JournalEntry } from "../../../state/journal/types/journal.js";
import type { SharedCatalog } from "../../../state/types/catalogStore.js";
import type { StoredSubject } from "../../../state/types/storedSubject.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { foldAcrossPush } from "./foldAcrossPush.js";
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
		"customer_not_stored" | "entity_not_stored" | "entity_stale"
	>;
}): CannotAnswerError => {
	ctx.subjectPulls.request({ customerId, entityId });
	return new CannotAnswerError({ reason });
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
	const customer = ctx.sqliteStore.readSubject({ customerId, entityId: null });
	if (!customer)
		throw subjectNotStored({
			ctx,
			customerId,
			entityId,
			reason: "customer_not_stored",
		});
	if (entityId === null) return { customer, entity: null };

	const entity = ctx.sqliteStore.readSubject({ customerId, entityId });
	if (!entity)
		throw subjectNotStored({
			ctx,
			customerId,
			entityId,
			reason: "entity_not_stored",
		});
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

/** Only appends happened since `previous`: anything else (a drop, a refusal, a restart) replaces an entry before its end. */
const isAppendedTo = ({
	owed,
	previous,
}: {
	owed: readonly JournalEntry[];
	previous: readonly JournalEntry[];
}): boolean =>
	owed.length > previous.length &&
	previous.every((entry, index) => owed[index] === entry);

/** Freezing a view walks the whole subject, a quarter of a deduction's CPU, so only tests pay it. */
const FREEZES_VIEWS = process.env.NODE_ENV === "test";

/** Keyed by the copy the request is for (the entity's, or the customer's), so a copy the store replaces takes its view with it. */
const subjectJoinCache = new WeakMap<StoredSubject, ViewFold>();
/** A customer's own fold, keyed by the last entry it applied: it outlives the copy a push replaces, and leaves with that entry. */
const foldByLastEntry = new WeakMap<JournalEntry, ViewFold>();

/** Pushes that replaced a customer's copy while it owed: the fold continued, or replayed from the push. Module state is the thread's own. */
let viewFoldKept = 0;
let viewFoldRebuilt = 0;

export const readViewFoldThreadStats = () => ({
	viewFoldKept,
	viewFoldRebuilt,
});

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
	const previousLast = previous?.owed.at(-1);
	if (previousLast) foldByLastEntry.delete(previousLast);
	const last = fold.owed.at(-1);
	if (last) foldByLastEntry.set(last, fold);
};

/**
 * The subject a request is decided on: as Autumn last sent it, with what the Atom owes Autumn for the customer replayed
 * on top; for an entity, the customer's rows and its own as one. Joined once per change to its parts, not per check.
 * A customer or entity Atom does not hold is left to the API.
 */
export const readCurrentSubject = ({
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
	if (isSameCopy && joined.owed === owed) return joined.current;
	const catalog = joinedCatalogOf({ customer, entity, shared });
	// A customer's own fold survives a new copy: a push that only acknowledged its deductions replays nothing.
	const isOwedOnNewCopy = !entity && !isSameCopy && owed.length > 0;
	const carried = isOwedOnNewCopy ? foldStillOwed({ owed }) : null;
	const carriedBase = carried
		? foldAcrossPush({ fold: carried, customer, owed, catalog })
		: null;
	if (isOwedOnNewCopy && carriedBase) viewFoldKept++;
	else if (isOwedOnNewCopy) viewFoldRebuilt++;
	// An append continues the cached fold, so n deductions between pushes cost n engine steps, not n²/2.
	const base: ReplayBase =
		carriedBase ??
		(isSameCopy && isAppendedTo({ owed, previous: joined.owed })
			? {
					state: joined.customerState,
					applied: joined.owed,
					fullSubject: entity ? null : joined.current.fullSubject,
				}
			: { state: customer.state, applied: [], fullSubject: null });
	const { current, customerState } = joinSubject({
		customer,
		entity,
		shared,
		owed,
		base,
		catalog,
		entityId,
	});
	// Every check until the next push or append shares it: frozen under test, so a mutation fails there.
	if (FREEZES_VIEWS) deepFreeze(current);
	const fold: ViewFold = { customer, shared, owed, customerState, current };
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
	const unapplied = owed.slice(base.applied.length);
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
