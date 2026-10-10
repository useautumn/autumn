import {
	mergeCatalogs,
	mergeSubjectStates,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
import { deepFreeze } from "../../../state/deepFreeze.js";
import type { SharedCatalog } from "../../../state/types/catalogStore.js";
import type { StoredSubject } from "../../../state/types/storedSubject.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { freshestCatalog } from "./freshestCatalog.js";

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
	if (!customer) throw new CannotAnswerError({ reason: "customer_not_stored" });
	if (entityId === null) return { customer, entity: null };

	const entity = ctx.sqliteStore.readSubject({ customerId, entityId });
	if (!entity) throw new CannotAnswerError({ reason: "entity_not_stored" });
	// Read from before the customer's latest evict, the entity may still hold rows that evict replaced.
	const isEntityCurrent = entity.logOffset >= customer.customerVersion;
	if (!isEntityCurrent) throw new CannotAnswerError({ reason: "entity_stale" });
	return { customer, entity };
};

/** The parts a subject was joined from: the view is current while the store still holds these very copies. */
type SubjectJoinCacheEntry = {
	customer: StoredSubject;
	shared: SharedCatalog | null;
	current: CurrentSubject;
};

/** Keyed by the copy the request is for (the entity's, or the customer's), so a copy the store replaces takes its view with it. */
const subjectJoinCache = new WeakMap<StoredSubject, SubjectJoinCacheEntry>();

/**
 * The subject a request is decided on, as Autumn last sent it: for an entity, the customer's rows and its own as one.
 * Joined once per change to its parts, not per check. A customer or entity Atom does not hold is left to the API.
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
	const target = entity ?? customer;
	const joined = subjectJoinCache.get(target);
	if (joined?.customer === customer && joined.shared === shared)
		return joined.current;
	// Frozen, because every check until the next push shares it.
	const current = deepFreeze(
		joinSubject({ customer, entity, shared, entityId }),
	);
	subjectJoinCache.set(target, { customer, shared, current });
	return current;
};

const joinSubject = ({
	customer,
	entity,
	shared,
	entityId,
}: {
	customer: StoredSubject;
	entity: StoredSubject | null;
	shared: SharedCatalog | null;
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

	return {
		fullSubject: subjectStateToFullSubject({
			state: mergeSubjectStates({
				customer: customer.state,
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
