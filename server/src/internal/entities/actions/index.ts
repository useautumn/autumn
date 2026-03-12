import { batchCreateEntities } from "./batchCreateEntities";
import { deleteEntity } from "./deleteEntity";
import { updateEntity } from "./updateEntity";

export const entityActions = {
	batchCreate: batchCreateEntities,
	delete: deleteEntity,
	update: updateEntity,
} as const;
