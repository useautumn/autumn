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
import type { SharedCatalog } from "../../../state/types/catalogStore.js";
import {
	isDeletedSubject,
	type StoredSubject,
} from "../../../state/types/storedSubject.js";
import type { CurrentSubject } from "../../types/currentSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";
import { freshestCatalog } from "./freshestCatalog.js";

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

type SubjectJoinCacheEntry = {
	customer: StoredSubject;
	shared: SharedCatalog | null;
	current: CurrentSubject;
};

const subjectJoinCache = new WeakMap<StoredSubject, SubjectJoinCacheEntry>();

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
		features: Object.values({
			...shared?.catalog.features,
			...catalog.features,
		}),
		org: customer.org,
	};
};
