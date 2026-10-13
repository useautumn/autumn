import {
	mergeCatalogs,
	mergeSubjectStates,
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

/** The parts a subject was joined from: the view is current while the store and journal still hold these very copies. */
type SubjectJoinCacheEntry = {
	customer: StoredSubject;
	shared: SharedCatalog | null;
	owed: readonly JournalEntry[];
	current: CurrentSubject;
};

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
	if (
		joined?.customer === customer &&
		joined.shared === shared &&
		joined.owed === owed
	)
		return joined.current;
	// Frozen, because every check until the next push or append shares it.
	const current = deepFreeze(
		joinSubject({ customer, entity, shared, owed, entityId }),
	);
	subjectJoinCache.set(target, { customer, shared, owed, current });
	return current;
};

const joinSubject = ({
	customer,
	entity,
	shared,
	owed,
	entityId,
}: {
	customer: StoredSubject;
	entity: StoredSubject | null;
	shared: SharedCatalog | null;
	owed: readonly JournalEntry[];
	entityId: string | null;
}): CurrentSubject => {
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
	const customerState =
		owed.length === 0
			? customer.state
			: replayOwed({ owed, state: customer.state, catalog });

	return {
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
};
