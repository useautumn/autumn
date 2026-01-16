import {
	ApiVersion,
	type CreateEntityParams,
	CreateEntityParamsSchema,
	CreateEntityQuerySchema,
	type CustomerData,
	type Entity,
	findFeatureById,
	notNullish,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { EntityService } from "../../../api/entities/EntityService.js";
import { getApiEntity } from "../../entityUtils/apiEntityUtils/getApiEntity.js";
import { constructEntity } from "../../entityUtils/entityUtils.js";
import { createEntityForCusProduct } from "./createEntityForCusProduct.js";
import { validateAndGetInputEntities } from "./getInputEntities.js";

export const createEntities = async ({
	ctx,
	logger,
	customerId,
	customerData,
	createEntityData,
	withAutumnId = false,
}: {
	ctx: AutumnContext;
	customerData?: CustomerData;
	logger: any;
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

export const handleCreateEntity = createRoute({
	query: CreateEntityQuerySchema,
	body: CreateEntityParamsSchema.or(z.array(CreateEntityParamsSchema)),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		// Skip cache for entity creation
		ctx.skipCache = true;

		const { customer_id } = c.req.param();
		const { with_autumn_id } = c.req.valid("query");

		let customerData: CustomerData | undefined;
		if (Array.isArray(body)) {
			customerData = body.filter((b) => notNullish(b.customer_data))?.[0]
				?.customer_data;
		} else {
			customerData = body.customer_data;
		}

		const apiEntities = await createEntities({
			ctx,
			customerId: customer_id,
			createEntityData: body,
			logger: ctx.logger,
			customerData,
			withAutumnId: with_autumn_id,
		});

		if (ctx.apiVersion.gte(ApiVersion.V1_2)) {
			if (Array.isArray(body) && body.length > 1) {
				return c.json({ list: apiEntities });
			} else {
				return c.json(apiEntities[0]);
			}
		} else {
			return c.json({ success: true });
		}
	},
});
