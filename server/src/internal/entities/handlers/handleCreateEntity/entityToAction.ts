import type { Entity } from "@autumn/shared";
import { notNullish, nullish } from "@/utils/genUtils.js";

export const logEntityToAction = ({
	entityToAction,
	logger,
}: {
	entityToAction: any;
	logger: any;
}) => {
	for (const id in entityToAction) {
		logger.info(
			`${id} - ${entityToAction[id].action}${
				entityToAction[id].replace
					? ` (replace ${
							entityToAction[id].replace.id ||
							entityToAction[id].replace.internal_id
						})`
					: ""
			}`,
		);
	}
};

// Probably going to change
export const getEntityToAction = ({
	inputEntities,
	existingEntities,
	feature,
	logger,
}: {
	inputEntities: any[];
	existingEntities: Entity[];
	feature: any;
	logger: any;
}) => {
	const entityToAction: any = {};
	let createCount = 0;
	const replacedEntities: string[] = [];
	for (const inputEntity of inputEntities) {
		const curEntity = existingEntities.find(
			(e: any) => e.id === inputEntity.id,
		);

		if (curEntity && curEntity.deleted) {
			entityToAction[inputEntity.id] = {
				action: "replace",
				replace: curEntity,
				entity: inputEntity,
			};
			replacedEntities.push(curEntity.id);
			continue;
		}

		let replaced = false;

		for (const entity of existingEntities) {
			if (entity.deleted && !replacedEntities.includes(entity.id)) {
				replaced = true;
				replacedEntities.push(entity.id);

				entityToAction[inputEntity.id] = {
					action: "replace",
					replace: entity,
					entity: inputEntity,
				};
				break;
			}

			// If there's an entity with null ID and cur input entity has an ID, fill it up!
			if (
				nullish(entity.id) &&
				notNullish(inputEntity.id) &&
				!replacedEntities.includes(entity.internal_id) &&
				entity.feature_id === feature.id
			) {
				entityToAction[inputEntity.id] = {
					action: "replace",
					replace: entity,
					entity: inputEntity,
				};

				replacedEntities.push(entity.internal_id);
				replaced = true;
				break;
			}
		}

		if (!replaced) {
			entityToAction[inputEntity.id] = {
				action: "create",
				entity: inputEntity,
			};
			createCount++;
		}
	}

	logEntityToAction({ entityToAction, logger });

	return entityToAction;
};
