import {
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
	let newEntities = structuredClone(cusEnt.entities) || {};
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
	let newEntities = structuredClone(cusEnt.entities) || {};
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
	let newEntities = structuredClone(cusEnt.entities) || {};
	for (const replaceableId of replaceableIds) {
		delete newEntities[replaceableId];
	}

	return { newEntities };
};
