import {
	type CreateEntityParams,
	type CustomerData,
	type Entity,
	ErrCode,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
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
		req: ctx as unknown as ExtendedRequest,
		customerId,
		customerData,
		withEntities: true,
	});

	if (!customer) {
		throw new RecaseError({
			message: `Customer ${customerId} not found`,
			code: ErrCode.CustomerNotFound,
		});
	}

	// 2. Get input entities
	let inputEntities: any[] = [];
	if (Array.isArray(createEntityData)) {
		inputEntities = createEntityData;
	} else {
		inputEntities = [createEntityData];
	}

	for (const entity of inputEntities) {
		const feature = features.find((f: any) => f.id === entity.feature_id);
		if (!feature) {
			throw new RecaseError({
				message: `Feature ${entity.feature_id} not found`,
				code: ErrCode.FeatureNotFound,
			});
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
			throw new RecaseError({
				message: `Entity ${entity.id} already exists`,
				code: "ENTITY_ALREADY_EXISTS",
				data: {
					entity,
				},
				statusCode: StatusCodes.CONFLICT,
			});
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
