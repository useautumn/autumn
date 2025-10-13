import {
	type AppEnv,
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
import { getSingleEntityResponse } from "@/internal/api/entities/getEntityUtils.js";
import { getV2CheckResponse } from "@/internal/api/entitled/checkUtils/getV2CheckResponse.js";
import { getCustomerDetails } from "@/internal/customers/cusUtils/getCustomerDetails.js";
import { toApiFeature } from "@/internal/features/utils/mapFeatureUtils.js";

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
	db,
	org,
	env,
	features,
	logger,
	feature,
	fullCus,
	thresholdType,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	features: Feature[];
	logger: any;
	feature: Feature;
	fullCus: FullCustomer;
	thresholdType: "limit_reached" | "allowance_used";
}) => {
	const apiVersion = createdAtToVersion({
		createdAt: org.created_at || undefined,
	});

	const cusDetails = await getCustomerDetails({
		db,
		customer: fullCus,
		org,
		env,
		features,
		logger,
		cusProducts: fullCus.customer_products,
		expand: [],
		apiVersion,
	});

	if (fullCus.entity) {
		await getSingleEntityResponse({
			org,
			env,
			features,
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
	db,
	org,
	env,
	features,
	logger,
	cusEnts,
	newCusEnts,
	feature,
	fullCus,
}: {
	db: DrizzleCli;
	org: Organization;
	env: AppEnv;
	cusEnts: FullCusEntWithFullCusProduct[];
	newCusEnts: FullCusEntWithFullCusProduct[];
	feature: Feature;
	fullCus: FullCustomer;
	features: Feature[];
	logger: any;
}) => {
	const apiVersion = createdAtToVersion({
		createdAt: org.created_at || undefined,
	});

	// Allowance used...
	// Make sure overage allowed is false
	const oldCusEnts = structuredClone(cusEnts);
	for (const cusEnt of oldCusEnts) {
		cusEnt.usage_allowed = false;
	}

	const clonedNewCusEnts = structuredClone(newCusEnts);
	for (const cusEnt of clonedNewCusEnts) {
		cusEnt.usage_allowed = false;
	}

	const prevCheckResponse = await getV2CheckResponse({
		fullCus,
		cusEnts: oldCusEnts,
		creditSystems: [],
		feature,
		org,
		cusProducts: fullCus.customer_products,
		apiVersion,
	});

	const v2CheckResponse = await getV2CheckResponse({
		fullCus,
		cusEnts: clonedNewCusEnts,
		creditSystems: [],
		feature,
		org,
		cusProducts: fullCus.customer_products,
		apiVersion,
	});

	// console.log(`Handling allowance used for feature: ${feature.id}`);
	// console.log(
	//   `Prev: allowed (${prevCheckResponse.allowed}), balance (${prevCheckResponse.balance})`
	// );
	// console.log(
	//   `Current: allowed (${v2CheckResponse.allowed}), balance (${v2CheckResponse.balance})`
	// );

	if (prevCheckResponse.allowed === true && v2CheckResponse.allowed === false) {
		await sendSvixThresholdReachedEvent({
			db,
			org,
			env,
			features,
			logger,
			feature,
			fullCus,
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

		const newCusProducts = mergeNewCusEntsIntoCusProducts({
			cusProducts: fullCus.customer_products,
			newCusEnts: newCusEnts,
		});

		fullCus.customer_products = newCusProducts;

		const prevCheckResponse = await getV2CheckResponse({
			fullCus,
			cusEnts: cusEnts,
			creditSystems: [],
			feature,
			org,
			cusProducts: fullCus.customer_products,
			apiVersion,
		});

		const v2CheckResponse = await getV2CheckResponse({
			fullCus,
			cusEnts: newCusEnts,
			creditSystems: [],
			feature,
			org,
			cusProducts: newCusProducts,
			apiVersion,
		});

		if (
			prevCheckResponse.allowed === true &&
			v2CheckResponse.allowed === false
		) {
			const cusDetails = await getCustomerDetails({
				db,
				customer: fullCus,
				org,
				env,
				features,
				logger,
				cusProducts: newCusProducts,
				expand: [],
				apiVersion,
			});

			if (fullCus.entity) {
				await getSingleEntityResponse({
					org,
					env,
					features,
					entity: fullCus.entity,
					fullCus,
					entityId: fullCus.entity.id,
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
			db,
			org,
			env,
			features,
			logger,
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
