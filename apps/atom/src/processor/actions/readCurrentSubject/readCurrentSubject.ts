import {
	mergeCatalogs,
	mergeSubjectStates,
	subjectStateToFullSubject,
} from "@autumn/balance-engine";
import { CannotAnswerError } from "../../../lib/forward/cannotAnswerError.js";
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
	return { customer, entity };
};

/**
 * The subject a request is decided on, as Autumn last sent it: for an entity, the customer's rows and its own as one.
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
