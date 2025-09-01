import type { CreateEntity } from "@autumn/shared";
import { ErrCode, type FullCustomer } from "@autumn/shared";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { constructEntity } from "../../entityUtils/entityUtils.js";
import { createEntityForCusProduct } from "./createEntityForCusProduct.js";

export const autoCreateEntity = async ({
	req,
	logger,
	customer,
	entityId,
	entityData,
}: {
	req: ExtendedRequest;
	logger: any;
	entityId: string;
	customer: FullCustomer;
	entityData?: CreateEntity;
}) => {
	// Validate CreatEntity
	// Failed to auto-create entity, no `feature_id` provided. Please pass in `feature_id` into the `entity_data` field of the request body",
	if (!entityData || !entityData.feature_id) {
		throw new RecaseError({
			message: `Entity with id ${entityData?.id || "unknown"} not found. To automatically create this entity, please pass in 'feature_id' into the 'entity_data' field of the request body.`,
			code: ErrCode.InvalidInputs,
		});
	}

	const { features, db } = req;

	const feature = features.find((f) => f.id === entityData.feature_id);

	if (!feature) {
		throw new RecaseError({
			message: `Feature ${entityData.feature_id} not found`,
			code: ErrCode.InvalidInputs,
		});
	}

	const inputEntity = {
		id: entityId,
		name: entityData.name,
		feature_id: entityData.feature_id,
	};

	for (const cusProduct of customer.customer_products) {
		await createEntityForCusProduct({
			req,
			customer,
			cusProduct,
			inputEntities: [inputEntity],
			fromAutoCreate: true,
			logger,
		});
	}

	const replaceEntity = await EntityService.getNull({
		db,
		orgId: customer.org_id,
		env: customer.env,
		internalCustomerId: customer.internal_id,
		internalFeatureId: feature.internal_id,
	});

	if (replaceEntity) {
		return await EntityService.update({
			db,
			internalId: replaceEntity.internal_id!,
			update: {
				id: entityId,
				name: entityData.name,
			},
		});
	} else {
		try {
			const _result = await EntityService.insert({
				db,
				data: [
					constructEntity({
						inputEntity,
						feature,
						internalCustomerId: customer.internal_id,
						orgId: customer.org_id,
						env: customer.env,
					}),
				],
			});
		} catch (error: any) {
			if (error.code === "23505") {
				return await EntityService.get({
					db,
					id: entityId,
					internalCustomerId: customer.internal_id,
					internalFeatureId: feature.internal_id,
				});
			} else {
				throw error;
			}
		}
	}
};
