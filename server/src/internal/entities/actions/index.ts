import { batchCreateEntities } from "./batchCreateEntities";
import { deleteEntity } from "./deleteEntity";

export const entityActions = {
	batchCreate: batchCreateEntities,
	delete: deleteEntity,
} as const;
