import {
	type AppEnv,
	AuthType,
	createdAtToVersion,
	type Feature,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	type FullCustomer,
	type Organization,
	WebhookEventType,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import { getV2CheckResponse } from "@/internal/api/check/checkUtils/getV2CheckResponse.js";
import { getSingleEntityResponse } from "@/internal/api/entities/getEntityUtils.js";
import { toApiFeature } from "@/internal/features/utils/mapFeatureUtils.js";
import type { AutumnContext } from "../honoUtils/HonoEnv.js";
import type { CheckData } from "../internal/api/check/checkTypes/CheckData.js";
import { getApiCustomer } from "../internal/customers/cusUtils/apiCusUtils/getApiCustomer.js";
import { generateId } from "../utils/genUtils.js";

export const mergeNewCusEntsIntoCusProducts = ({
	cusProducts,
	newCusEnts,
}: {
	cusProducts: FullCusProduct[];
	newCusEnts: FullCusEntWithFullCusProduct[];
}) => {
	for (const cusProduct of cusProducts) {
		for (let i = 0; i < cusProduct.customer_entitlements.length; i++) {
			const correspondingCusEnt = newCusEnts.find(
				(cusEnt) => cusEnt.id === cusProduct.customer_entitlements[i].id,
			);

			if (correspondingCusEnt) {
				const { customer_product, ...rest } = correspondingCusEnt;
				cusProduct.customer_entitlements[i] = rest;
			}
		}
	}

	return cusProducts;
};

export const sendSvixThresholdReachedEvent = async ({
	ctx,
	feature,
	fullCus,
	thresholdType,
}: {
	ctx: AutumnContext;
	feature: Feature;
	fullCus: FullCustomer;
	thresholdType: "limit_reached" | "allowance_used";
}) => {
	const { org, env, logger } = ctx;

	const cusDetails = await getApiCustomer({
		ctx,
		fullCus,
	});

	if (fullCus.entity) {
		await getSingleEntityResponse({
			ctx,
			fullCus,
			entity: fullCus.entity,
			entityId: fullCus.entity.id,
		});
	}

	await sendSvixEvent({
		org: org,
		env: env,
		eventType: WebhookEventType.CustomerThresholdReached,
		data: {
			threshold_type: thresholdType,
			customer: cusDetails,
			feature: toApiFeature({ feature }),
		},
	});

	logger.info(`Sent Svix event for threshold reached (type: ${thresholdType})`);
	return;
};

export const handleAllowanceUsed = async ({
	ctx,
	cusEnts,
	newCusEnts,
	feature,
	fullCus,
}: {
	ctx: AutumnContext;
	cusEnts: FullCusEntWithFullCusProduct[];
	newCusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
	fullCus: FullCustomer;
}) => {
	const { db, org, env, features, logger } = ctx;

	// Make sure overage allowed is false
	const oldCusEnts = structuredClone(cusEnts);
	for (const cusEnt of oldCusEnts) {
		cusEnt.usage_allowed = false;
	}

	const clonedNewCusEnts = structuredClone(newCusEnts);
	for (const cusEnt of clonedNewCusEnts) {
		cusEnt.usage_allowed = false;
	}

	const prevCheckData: CheckData = {
		fullCus,
		cusEnts: oldCusEnts,
		originalFeature: feature,
		featureToUse: feature,
		cusProducts: fullCus.customer_products,
		entity: fullCus.entity,
	};

	const newCheckData: CheckData = {
		fullCus,
		cusEnts: clonedNewCusEnts,
		originalFeature: feature,
		featureToUse: feature,
		cusProducts: fullCus.customer_products,
		entity: fullCus.entity,
	};
	const prevCheckResponse = await getV2CheckResponse({
		ctx,
		checkData: prevCheckData,
		requiredBalance: 1,
	});

	const v2CheckResponse = await getV2CheckResponse({
		ctx,
		checkData: newCheckData,
		requiredBalance: 1,
	});

	if (prevCheckResponse.allowed === true && v2CheckResponse.allowed === false) {
		await sendSvixThresholdReachedEvent({
			ctx,
			fullCus,
			feature,
			thresholdType: "allowance_used",
		});
	}
};

export const handleThresholdReached = async ({
	db,
	feature,
	cusEnts,
	newCusEnts,
	fullCus,
	org,
	env,
	features,
	logger,
}: {
	db: DrizzleCli;
	feature: Feature;
	cusEnts: FullCusEntWithFullCusProduct[];
	newCusEnts: FullCusEntWithFullCusProduct[];

	fullCus: FullCustomer;
	org: Organization;
	env: AppEnv;
	features: Feature[];
	logger: any;
}) => {
	try {
		const apiVersion = createdAtToVersion({
			createdAt: org.created_at || undefined,
		});

		const ctx: AutumnContext = {
			db,
			org,
			env,
			features,
			logger,

			isPublic: false,
			authType: AuthType.SecretKey,
			apiVersion,
			timestamp: Date.now(),
			id: generateId("local_req"),
			clickhouseClient: null as any,
			expand: [],
		};

		const checkData1: CheckData = {
			fullCus,
			cusEnts,
			originalFeature: feature,
			featureToUse: feature,
			cusProducts: fullCus.customer_products,
			entity: fullCus.entity,
		};

		const prevCheckResponse = await getV2CheckResponse({
			ctx,
			checkData: checkData1,
			requiredBalance: 1,
		});

		const newCusProducts = mergeNewCusEntsIntoCusProducts({
			cusProducts: fullCus.customer_products,
			newCusEnts: newCusEnts,
		});

		fullCus.customer_products = newCusProducts;

		const checkData2: CheckData = {
			fullCus,
			cusEnts: newCusEnts,
			originalFeature: feature,
			featureToUse: feature,
			cusProducts: newCusProducts,
			entity: fullCus.entity,
		};

		const newCheckResponse = await getV2CheckResponse({
			ctx,
			checkData: checkData2,
			requiredBalance: 1,
		});

		if (
			prevCheckResponse.allowed === true &&
			newCheckResponse.allowed === false
		) {
			const cusDetails = await getApiCustomer({
				ctx,
				fullCus,
			});

			if (fullCus.entity) {
				await getSingleEntityResponse({
					ctx,
					entityId: fullCus.entity.id,
					fullCus,
					entity: fullCus.entity,
				});
			}

			await sendSvixEvent({
				org: org,
				env: env,
				eventType: WebhookEventType.CustomerThresholdReached,
				data: {
					threshold_type: "limit_reached",
					customer: cusDetails,
					feature: toApiFeature({ feature }),
				},
			});

			logger.info(
				"Sent Svix event for threshold reached (type: limit_reached)",
			);
			return;
		}
		await handleAllowanceUsed({
			ctx,
			cusEnts,
			newCusEnts,
			feature,
			fullCus,
		});
		return;
	} catch (error: any) {
		logger.error("Failed to handle threshold reached", {
			error,
			message: error?.message,
		});
	}
};
