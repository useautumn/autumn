import {
	ApiVersion,
	type CreateEntityParams,
	CreateEntityParamsSchema,
	CreateEntityQuerySchema,
	type CustomerData,
	type Entity,
	notNullish,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "../../../../honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import type { ExtendedRequest } from "../../../../utils/models/Request.js";
import { EntityService } from "../../../api/entities/EntityService.js";
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
		logger,
	});

	for (const cusProduct of cusProducts) {
		await createEntityForCusProduct({
			req: ctx as unknown as ExtendedRequest,
			customer: fullCus,
			cusProduct,
			inputEntities,
			logger,
		});
	}

	let data = inputEntities.map((e: any) =>
		constructEntity({
			inputEntity: e,
			feature: features.find((f: any) => f.id === e.feature_id)!,
			internalCustomerId: fullCus.internal_id,
			orgId: org.id,
			env,
		}),
	);

	const newEntities: Entity[] = [];
	if (existingEntities.some((e: Entity) => e.id === null)) {
		const updatedEntity = await EntityService.update({
			db,
			internalId: existingEntities.find((e: any) => e.id === null)!.internal_id,
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

	// // Get api entity for each entity...
	// const apiEntities = [];
	// for (const entity of newEntities) {
	// 	// Cloned fullCus
	// 	const clonedFullCus = structuredClone(fullCus);
	// 	clonedFullCus.entity = entity;
	// 	const apiEntity = await getApiEntity({
	// 		ctx,
	// 		expand: [],
	// 		customerId,
	// 		entityId: entity.id,
	// 		fullCus: clonedFullCus,
	// 		withAutumnId,
	// 	});
	// 	apiEntities.push(apiEntity);
	// }
	return newEntities;

	// return apiEntities;
};

export const handleCreateEntity = createRoute({
	query: CreateEntityQuerySchema,
	body: CreateEntityParamsSchema.or(z.array(CreateEntityParamsSchema)),
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { customer_id } = c.req.param();

		const body = c.req.valid("json");
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
