import {
	type CreateEntity,
	type CustomerData,
	type Entity,
	LegacyVersion,
} from "@autumn/shared";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { orgToVersion } from "@/utils/versionUtils/legacyVersionUtils.js";
import { EntityService } from "../../../api/entities/EntityService.js";
import { getEntityResponse } from "../../../api/entities/getEntityUtils.js";
import { constructEntity } from "../../entityUtils/entityUtils.js";
import { createEntityForCusProduct } from "./createEntityForCusProduct.js";
import { validateAndGetInputEntities } from "./getInputEntities.js";

export const createEntities = async ({
	req,
	logger,
	customerId,
	customerData,
	createEntityData,
	withAutumnId = false,
	apiVersion,
	fromAutoCreate = false,
}: {
	req: ExtendedRequest;
	customerData?: CustomerData;
	logger: any;
	customerId: string;
	createEntityData: CreateEntity[] | CreateEntity;
	withAutumnId?: boolean;
	apiVersion?: LegacyVersion;
	fromAutoCreate?: boolean;
}) => {
	const { db, org, env, features } = req;

	// 1. Get data
	const { customer, inputEntities, cusProducts, existingEntities } =
		await validateAndGetInputEntities({
			req,
			customerId,
			customerData,
			createEntityData,
			logger,
		});

	for (const cusProduct of cusProducts) {
		await createEntityForCusProduct({
			req,
			customer,
			cusProduct,
			inputEntities,
			logger,
		});
	}

	let data = inputEntities.map((e: any) =>
		constructEntity({
			inputEntity: e,
			feature: features.find((f: any) => f.id === e.feature_id)!,
			internalCustomerId: customer.internal_id,
			orgId: org.id,
			env,
		}),
	);

	const newEntities: Entity[] = [];
	if (existingEntities.some((e: any) => e.id === null)) {
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

	if (fromAutoCreate) {
		return newEntities;
	}

	const { entities } = await getEntityResponse({
		db,
		entityIds: newEntities.map((e: any) => e.id || e.internal_id),
		org,
		env,
		customerId: customer.id || customer.internal_id,
		withAutumnId,
		apiVersion: apiVersion!,
		features,
		logger,
		skipCache: true,
	});

	return entities;
};

export const handlePostEntityRequest = async (req: any, res: any) =>
	routeHandler({
		req,
		res,
		action: "create entity",
		handler: async (req: any, res: any) => {
			const { logtail: logger, org } = req;

			const apiVersion = orgToVersion({
				org,
				reqApiVersion: req.apiVersion,
			});

			const customerData =
				Array.isArray(req.body) && req.body.length > 0
					? req.body[0].customer_data
					: req.body.customer_data;

			const entities = await createEntities({
				req,
				logger,
				customerId: req.params.customer_id,
				createEntityData: req.body,
				customerData,
				withAutumnId: req.query.with_autumn_id === "true",
				apiVersion,
			});

			logger.info(`  Created / replaced entities!`);

			if (apiVersion < LegacyVersion.v1_2) {
				res.status(200).json({
					success: true,
				});
				return;
			}
			if (Array.isArray(req.body)) {
				res.status(200).json({
					list: entities,
				});
			} else {
				res.status(200).json(entities[0]);
			}
		},
	});
