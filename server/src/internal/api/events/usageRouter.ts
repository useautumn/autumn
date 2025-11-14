import {
	CusProductStatus,
	ErrCode,
	type EventInsert,
	FeatureType,
	type FullCustomer,
} from "@autumn/shared";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { creditSystemContainsFeature } from "@/internal/features/creditSystemUtils.js";
import { runUpdateUsageTask } from "@/trigger/updateUsageTask.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { generateId, nullish } from "@/utils/genUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { EventService } from "./EventService.js";
import { getEventTimestamp } from "./eventUtils.js";

export const eventsRouter: Router = Router();
export const usageRouter: Router = Router();

const getCusFeatureAndOrg = async ({
	req,
	customerId,
	featureId,
	entityId,
	customerData,
}: {
	req: ExtendedRequest;
	customerId: string;
	featureId: string;
	entityId: string;
	customerData: any;
}) => {
	// 1. Get customer
	const { org, features } = req;

	const customer = await getOrCreateCustomer({
		ctx: req as unknown as AutumnContext,
		customerId,
		customerData,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		entityId,
		entityData: req.body.entity_data,
		withEntities: true,
	});

	const feature = features.find((f) => f.id === featureId);
	const creditSystems = features.filter(
		(f) =>
			f.type === FeatureType.CreditSystem &&
			creditSystemContainsFeature({
				creditSystem: f,
				meteredFeatureId: featureId,
			}),
	);

	if (!feature) {
		throw new RecaseError({
			message: `Feature ${featureId} not found`,
			code: ErrCode.FeatureNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	return { customer, org, feature, creditSystems };
};

const createAndInsertEvent = async ({
	req,
	customer,
	featureId,
	value,
	set_usage,
	properties,
	idempotencyKey,
}: {
	req: any;
	customer: FullCustomer;
	featureId: string;
	value?: number;
	set_usage?: boolean;
	properties: any;
	idempotencyKey?: string;
}) => {
	if (!customer.id) {
		throw new RecaseError({
			message: "Customer ID is required",
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const timestamp = getEventTimestamp(req.body.timestamp);

	const entityId = req.body.entity_id;
	let internalEntityId = null;
	if (entityId) {
		internalEntityId = customer.entity?.internal_id;
	}

	const newEvent: EventInsert = {
		id: generateId("evt"),
		org_id: req.org.id,
		org_slug: req.org.slug,
		env: req.env,
		internal_customer_id: customer.internal_id,

		created_at: timestamp.getTime(),
		timestamp: timestamp,

		idempotency_key: idempotencyKey,
		customer_id: customer.id,
		event_name: featureId,
		properties,
		value,
		set_usage: set_usage || false,
		entity_id: req.body.entity_id,
		internal_entity_id: internalEntityId,
	};

	return await EventService.insert({ db: req.db, event: newEvent });
};

export const handleUsageEvent = async ({
	req,
	setUsage = false,
}: {
	req: any;
	setUsage?: boolean;
}) => {
	let {
		customer_id,
		customer_data,
		properties,
		feature_id,
		value,
		entity_id,
		idempotency_key,
	} = req.body;
	const { logger } = req;

	if (!customer_id || !feature_id) {
		throw new RecaseError({
			message: "customer_id and feature_id are required",
			code: ErrCode.InvalidInputs,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	properties = properties || {};

	const { customer, feature, creditSystems } = await getCusFeatureAndOrg({
		req,
		customerId: customer_id,
		featureId: feature_id,
		customerData: customer_data,
		entityId: entity_id,
	});

	const newEvent = await createAndInsertEvent({
		req,
		customer,
		featureId: feature_id,
		value,
		set_usage: setUsage,
		properties,
		idempotencyKey: idempotency_key,
	});

	const features = [feature, ...creditSystems];

	if (nullish(value) || Number.isNaN(parseFloat(value))) {
		value = 1;
	} else {
		value = parseFloat(value);
	}

	const payload = {
		customerId: customer.id,
		internalCustomerId: customer.internal_id,
		eventId: newEvent.id,
		features,
		allFeatures: req.features,
		org: req.org,
		env: req.env,
		properties,
		value,
		set_usage: setUsage,
		entityId: entity_id,
	};

	await runUpdateUsageTask({
		payload,
		logger: console,
		db: req.db,
		throwError: true,
	});

	return { event: newEvent, affectedFeatures: features, org: req.org };
};

usageRouter.post("", async (req: any, res: any) => {
	try {
		await handleUsageEvent({ req, setUsage: true });
		res.status(StatusCodes.OK).json({ success: true });
	} catch (error) {
		return handleRequestError({
			req,
			res,
			error,
			action: "handleUsageEvent",
		});
	}
});
