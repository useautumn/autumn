import { batchCreateEntities } from "./batchCreateEntities";
import { deleteEntity } from "./deleteEntity";
import { listEntities } from "./listEntities";
import { updateEntity } from "./updateEntity";

export const entityActions = {
	batchCreate: batchCreateEntities,
	delete: deleteEntity,
	list: listEntities,
	update: updateEntity,
} as const;
