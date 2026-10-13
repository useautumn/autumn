import {
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
import {
	isDeletedSubject,
	type StoredSubject,
} from "../../../state/types/storedSubject.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { freshestCatalog } from "./freshestCatalog.js";
import { replayOwed } from "./replayOwed.js";

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

/** The parts a subject was joined from: the view is current while the store and journal still hold these very copies. */
type SubjectJoinCacheEntry = {
	customer: StoredSubject;
	shared: SharedCatalog | null;
	owed: readonly JournalEntry[];
	/** The customer's own rows with `owed` applied, which a later append continues from. */
	customerState: SubjectState;
	current: CurrentSubject;
};

/** What a view's customer rows start from: the stored copy, or a cached view that already applied `applied`. */
type ReplayBase = { state: SubjectState; applied: readonly JournalEntry[] };

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

/** Keyed by the copy the request is for (the entity's, or the customer's), so a copy the store replaces takes its view with it. */
const subjectJoinCache = new WeakMap<StoredSubject, SubjectJoinCacheEntry>();

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
	// An append continues the cached fold, so n deductions between pushes cost n engine steps, not n²/2.
	const base: ReplayBase =
		isSameCopy && isAppendedTo({ owed, previous: joined.owed })
			? { state: joined.customerState, applied: joined.owed }
			: { state: customer.state, applied: [] };
	const { current, customerState } = joinSubject({
		customer,
		entity,
		shared,
		owed,
		base,
		entityId,
	});
	// Frozen, because every check until the next push or append shares it.
	deepFreeze(current);
	subjectJoinCache.set(target, {
		customer,
		shared,
		owed,
		customerState,
		current,
	});
	return current;
};

const joinSubject = ({
	customer,
	entity,
	shared,
	owed,
	base,
	entityId,
}: {
	customer: StoredSubject;
	entity: StoredSubject | null;
	shared: SharedCatalog | null;
	owed: readonly JournalEntry[];
	base: ReplayBase;
	entityId: string | null;
}): { current: CurrentSubject; customerState: SubjectState } => {
	// The part read later is merged last, so where both hold a row its copy is the one kept.
	const parts = entity ? [customer, entity] : [customer];
	const partsOldestFirst = [...parts].sort(
		(left, right) => left.readAt - right.readAt,
	);
	const catalog = mergeCatalogs({
		catalogs: partsOldestFirst.map((stored) =>
			freshestCatalog({ stored, shared }),
		),
	});

	// Only a customer's own deductions are owed, and they move only the customer's own rows.
	const unapplied = owed.slice(base.applied.length);
	const customerState =
		unapplied.length === 0
			? base.state
			: replayOwed({ owed: unapplied, state: base.state, catalog });

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
