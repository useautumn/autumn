import {
	type Entity,
	type EntityData,
	ErrCode,
	FeatureNotFoundError,
	type FullCustomer,
	RecaseError,
} from "@autumn/shared";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { upsertEntityInCache } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/appendEntityToCache.js";

import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { CusService } from "../../../customers/CusService.js";
import { constructEntity } from "../../entityUtils/entityUtils.js";
import { createEntityForCusProduct } from "./createEntityForCusProduct.js";

export const autoCreateEntity = async ({
	ctx,
	entityId,
	entityData,
	customerId,
	fullCus,
}: {
	ctx: AutumnContext;
	entityId: string;
	entityData?: EntityData;
	customerId: string;
	fullCus?: FullCustomer;
}): Promise<Entity | undefined> => {
	// Validate CreatEntity
	// Failed to auto-create entity, no `feature_id` provided. Please pass in `feature_id` into the `entity_data` field of the request body",
	if (!entityData || !entityData.feature_id) {
		throw new RecaseError({
			message: `Entity with id ${entityId || "unknown"} not found. To automatically create this entity, please pass in 'feature_id' into the 'entity_data' field of the request body.`,
			code: ErrCode.InvalidInputs,
		});
	}

	const { features, db } = ctx;
	const feature = features.find((f) => f.id === entityData.feature_id);

	if (!feature) {
		throw new FeatureNotFoundError({ featureId: entityData.feature_id });
	}

	const inputEntity = {
		id: entityId,
		name: entityData.name,
		feature_id: entityData.feature_id,
	};

	if (!fullCus) {
		fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			entityId,
		});

		// handle race condition?
		if (fullCus.entity && fullCus.entity.id === entityId) {
			return fullCus.entity;
		}
	}

	for (const cusProduct of fullCus.customer_products) {
		await createEntityForCusProduct({
			ctx,
			customer: fullCus,
			cusProduct,
			inputEntities: [inputEntity],
			fromAutoCreate: true,
		});
	}

	const replaceEntity = await EntityService.getNull({
		db,
		orgId: fullCus.org_id,
		env: fullCus.env,
		internalCustomerId: fullCus.internal_id,
		internalFeatureId: feature.internal_id,
	});

	let entity: Entity | null | undefined;

	if (replaceEntity) {
		entity = await EntityService.update({
			db,
			internalId: replaceEntity.internal_id,
			update: {
				id: entityId,
				name: entityData.name,
			},
		});
	} else {
		try {
			const results = await EntityService.insert({
				db,
				data: [
					constructEntity({
						inputEntity,
						feature,
						internalCustomerId: fullCus.internal_id,
						orgId: fullCus.org_id,
						env: fullCus.env,
					}),
				],
			});

			entity = results?.[0];
		} catch (error) {
			if (isUniqueConstraintError(error)) {
				entity = (await EntityService.get({
					db,
					id: entityId,
					internalCustomerId: fullCus.internal_id,
					internalFeatureId: feature.internal_id,
				})) as Entity | undefined;
			} else {
				throw error;
			}
		}
	}

	// Add/update entity in full customer cache
	if (entity) {
		await upsertEntityInCache({
			ctx,
			customerId,
			entity,
		});
	}

	return entity;
};
