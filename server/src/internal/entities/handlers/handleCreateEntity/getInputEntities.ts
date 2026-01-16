import {
	type CreateEntityParams,
	type CustomerData,
	type Entity,
	EntityAlreadyExistsError,
	ErrCode,
	FeatureNotFoundError,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

export const validateAndGetInputEntities = async ({
	ctx,
	customerId,
	customerData,
	createEntityData,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerData?: CustomerData;
	createEntityData: CreateEntityParams[] | CreateEntityParams;
}) => {
	const { features } = ctx;

	// 1. Get customer
	const customer = await getOrCreateCustomer({
		ctx,
		customerId,
		customerData,
		withEntities: true,
	});

	// 2. Get input entities
	let inputEntities: CreateEntityParams[] = [];
	if (Array.isArray(createEntityData)) {
		inputEntities = createEntityData;
	} else {
		inputEntities = [createEntityData];
	}

	for (const entity of inputEntities) {
		const feature = features.find((f: any) => f.id === entity.feature_id);
		if (!feature) {
			throw new FeatureNotFoundError({ featureId: entity.feature_id });
		}
	}

	const cusProducts = customer.customer_products;
	const existingEntities = customer.entities;

	const noIdEntities = existingEntities.filter((e: Entity) => !e.id);
	const noIdNewEntities = inputEntities.filter(
		(e: CreateEntityParams) => !e.id,
	);

	if (noIdEntities.length + noIdNewEntities.length > 1) {
		throw new RecaseError({
			message: "Can only have one entity with no ID",
			code: ErrCode.EntityIdRequired,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	for (const entity of existingEntities) {
		if (inputEntities.some((e: any) => e.id === entity.id) && !entity.deleted) {
			throw new EntityAlreadyExistsError({ entityId: entity.id });
		}
	}

	return {
		customer,
		features,
		inputEntities,
		cusProducts,
		existingEntities,
	};
};
