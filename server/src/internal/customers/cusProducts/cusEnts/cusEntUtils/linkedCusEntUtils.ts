import type {
	FullCustomerEntitlement,
	InsertReplaceable,
	Replaceable,
} from "@autumn/shared";

export const replaceEntityInCusEnt = ({
	cusEnt,
	entityId,
	replaceable,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId: string;
	replaceable: Replaceable | InsertReplaceable;
}) => {
	const newEntities = structuredClone(cusEnt.entities) || {};
	newEntities[replaceable.id] = newEntities[entityId];

	delete newEntities[entityId];

	return { newEntities };
};

export const deleteEntityFromCusEnt = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId: string;
}) => {
	const newEntities = structuredClone(cusEnt.entities) || {};
	delete newEntities[entityId];

	return { newEntities };
};

export const removeReplaceablesFromCusEnt = ({
	cusEnt,
	replaceableIds,
}: {
	cusEnt: FullCustomerEntitlement;
	replaceableIds: string[];
}) => {
	const newEntities = structuredClone(cusEnt.entities) || {};
	for (const replaceableId of replaceableIds) {
		delete newEntities[replaceableId];
	}

	return { newEntities };
};
