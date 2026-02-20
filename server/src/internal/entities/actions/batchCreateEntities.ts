import {
	type CreateEntityParams,
	type CustomerData,
	type Entity,
	findFeatureById,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntityService } from "@/internal/api/entities/EntityService";
import { getApiEntity } from "../entityUtils/apiEntityUtils/getApiEntity";
import { constructEntity } from "../entityUtils/entityUtils";
import { createEntityForCusProduct } from "../handlers/handleCreateEntity/createEntityForCusProduct";
import { validateAndGetInputEntities } from "../handlers/handleCreateEntity/getInputEntities";

export const batchCreateEntities = async ({
	ctx,
	customerId,
	customerData,
	createEntityData,
	withAutumnId = false,
}: {
	ctx: AutumnContext;
	customerData?: CustomerData;
	customerId: string;
	createEntityData: CreateEntityParams[] | CreateEntityParams;
	withAutumnId?: boolean;
}) => {
	const { db, org, env, features } = ctx;

	// 1. Get data
	const {
		customer: fullCus,
		inputEntities,
		cusProducts,
		existingEntities,
	} = await validateAndGetInputEntities({
		ctx,
		customerId,
		customerData,
		createEntityData,
	});

	for (const cusProduct of cusProducts) {
		await createEntityForCusProduct({
			ctx,
			customer: fullCus,
			cusProduct,
			inputEntities,
		});
	}

	let data = inputEntities.map((e) =>
		constructEntity({
			inputEntity: e,
			feature: findFeatureById({
				features,
				featureId: e.feature_id,
				errorOnNotFound: true,
			}),
			internalCustomerId: fullCus.internal_id,
			orgId: org.id,
			env,
		}),
	);

	const newEntities: Entity[] = [];

	const noIdEntity = existingEntities.find((e) => e.id === null);
	if (noIdEntity) {
		const updatedEntity = await EntityService.update({
			db,
			internalId: noIdEntity.internal_id,
			update: {
				id: inputEntities[0].id,
				name: inputEntities[0].name,
			},
		});

		data = data.slice(1);
		newEntities.push(updatedEntity);
	}

	const insertedEntities = await EntityService.insert({
		db,
		data,
	});

	newEntities.push(...insertedEntities);

	// Get api entity for each entity...
	const apiEntities = [];
	for (const entity of newEntities) {
		// Cloned fullCus

		const clonedFullCus = structuredClone(fullCus);
		clonedFullCus.entity = entity;

		const apiEntity = await getApiEntity({
			ctx,
			customerId,
			entityId: entity.id,
			fullCus: clonedFullCus,
			withAutumnId,
		});
		apiEntities.push(apiEntity);
	}

	return apiEntities;
};
