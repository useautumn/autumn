import { ApiVersion, ErrCode, type Feature, FeatureType } from "@autumn/shared";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { handleEventSent } from "../events/eventRouter.js";
import { getCheckData } from "./checkUtils/getCheckData.js";
import { getV1CheckResponse } from "./checkUtils/getV1CheckResponse.js";
import { getV2CheckResponse } from "./checkUtils/getV2CheckResponse.js";
import { getBooleanEntitledResult } from "./checkUtils.js";
import { getCheckPreview } from "./getCheckPreview.js";
import { handleProductCheck } from "./handlers/handleProductCheck.js";

export const checkRouter: Router = Router();

checkRouter.post("", async (req: any, res: any) => {
	try {
		const {
			customer_id,
			feature_id,
			product_id,
			required_quantity,
			required_balance,
			customer_data,
			send_event,
			event_data,
			entity_id,
		} = req.body;

		const { logtail: logger, db } = req;

		if (!customer_id) {
			throw new RecaseError({
				message: "`customer_id` is required",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (!feature_id && !product_id) {
			throw new RecaseError({
				message: "`feature_id` or `product_id` is required",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (feature_id && product_id) {
			throw new RecaseError({
				message:
					"Provide either feature_id or product_id. Not allowed to provide both",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (product_id) {
			await handleProductCheck({ req, res });
			return;
		}

		const requiredBalance = notNullish(required_balance)
			? required_balance
			: notNullish(required_quantity)
				? required_quantity
				: null;

		let quantity = 1;
		if (notNullish(requiredBalance)) {
			const floatQuantity = parseFloat(requiredBalance);

			if (Number.isNaN(floatQuantity)) {
				throw new RecaseError({
					message: "Invalid required_balance",
					code: ErrCode.InvalidRequest,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
			quantity = floatQuantity;
		}

		const {
			fullCus,
			cusEnts,
			feature,
			creditSystems,
			org,
			cusProducts,
			allFeatures,
		} = await getCheckData({ req });

		// 2. If boolean, return true
		if (feature.type === FeatureType.Boolean) {
			return await getBooleanEntitledResult({
				db,
				fullCus,
				res,
				cusEnts,
				feature,
				apiVersion: req.apiVersion,
				withPreview: req.body.with_preview,
				cusProducts,
				allFeatures,
			});
		}

		const v1Response = getV1CheckResponse({
			originalFeature: feature,
			creditSystems,
			cusEnts: cusEnts!,
			quantity,
			entityId: entity_id,
			org,
		});

		const v2Response = await getV2CheckResponse({
			fullCus,
			cusEnts,
			feature,
			creditSystems,
			org,
			cusProducts,
			requiredBalance,
			apiVersion: req.apiVersion,
		});

		const { allowed, balance } = v2Response;
		const featureToUse = allFeatures.find(
			(f: Feature) => f.id === v2Response.feature_id,
		);

		if (allowed && req.isPublic !== true) {
			if (send_event) {
				await handleEventSent({
					req: {
						...req,
						body: {
							...req.body,
							value: quantity,
						},
					},
					customer_id: customer_id,
					customer_data: customer_data,
					event_data: {
						customer_id: customer_id,
						feature_id: feature_id,
						value: quantity,
						entity_id: entity_id,
					},
				});
			} else if (notNullish(event_data)) {
				await handleEventSent({
					req,
					customer_id: customer_id,
					customer_data: customer_data,
					event_data: {
						customer_id: customer_id,
						feature_id: feature_id,
						...event_data,
					},
				});
			}
		}

		let preview;
		if (req.body.with_preview) {
			try {
				preview = await getCheckPreview({
					db,
					allowed,
					balance: notNullish(balance) ? balance : undefined,
					feature: featureToUse!,
					cusProducts,
					allFeatures,
				});
			} catch (error) {
				logger.error("Failed to get check preview", error);
				console.error(error);
			}
		}

		if (req.apiVersion.gte(ApiVersion.V1_1)) {
			res.status(200).json({
				...v2Response,
				preview,
			});
		} else {
			res.status(200).json({
				...v1Response,
				preview,
			});
		}

		return;
	} catch (error) {
		handleRequestError({ req, error, res, action: "Failed to GET entitled" });
	}
});

// let features = [feature, ...creditSystems];
// let balanceObj: any, featureToUse: any;
// try {
//   balanceObj = balances.length > 0 ? balances[0] : null;

//   featureToUse =
//     notNullish(balanceObj) && balanceObj.feature_id !== feature.id
//       ? features.find((f) => f.id === balanceObj.feature_id)
//       : creditSystems.length > 0
//         ? creditSystems[0]
//         : feature;
// } catch (error) {
//   logger.error(`/check: failed to get balance & feature to use`, error);
// }

// 3. If with preview, get preview
