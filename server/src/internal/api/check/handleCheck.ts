import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckParams,
	CheckParamsSchema,
	type CheckResult,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCheckData } from "./checkUtils/getCheckData.js";
import { getV2CheckResponse } from "./checkUtils/getV2CheckResponse.js";
import { handleProductCheck } from "./handlers/handleProductCheck.js";

const DEFAULT_REQUIRED_BALANCE = 1;
export const handleCheck = createRoute({
	body: CheckParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");
		const {
			customer_id,
			feature_id,
			product_id,
			entity_id,
			customer_data,
			required_quantity,
			required_balance,
			send_event,
		} = body;

		// Legacy path - product check
		if (product_id) {
			const checkProductResult = await handleProductCheck({
				ctx: c.get("ctx"),
				body: { ...body, product_id }, // Ensure product_id is passed as string
			});
			return c.json(checkProductResult);
		}

		const requiredBalance =
			required_balance ?? required_quantity ?? DEFAULT_REQUIRED_BALANCE;

		// let quantity = 1;
		// if (notNullish(requiredBalance)) {
		// 	const floatQuantity = parseFloat(requiredBalance);

		// 	if (Number.isNaN(floatQuantity)) {
		// 		throw new RecaseError({
		// 			message: "Invalid required_balance",
		// 			code: ErrCode.InvalidRequest,
		// 			statusCode: StatusCodes.BAD_REQUEST,
		// 		});
		// 	}
		// 	quantity = floatQuantity;
		// }

		const checkData = await getCheckData({
			ctx,
			body: body as CheckParams & { feature_id: string },
		});

		// // 2. If boolean, return true
		// if (feature.type === FeatureType.Boolean) {
		// 	return await getBooleanEntitledResult({
		// 		db,
		// 		fullCus,
		// 		res,
		// 		cusEnts,
		// 		feature,
		// 		apiVersion: req.apiVersion,
		// 		withPreview: req.body.with_preview,
		// 		cusProducts,
		// 		allFeatures,
		// 	});
		// }

		// const v1Response = getV1CheckResponse({
		// 	originalFeature: feature,
		// 	creditSystems,
		// 	cusEnts: cusEnts!,
		// 	quantity,
		// 	entityId: entity_id,
		// 	org,
		// });

		const v2Response = await getV2CheckResponse({
			ctx,
			checkData,
			requiredBalance,
		});

		console.log("API Version:", ctx.apiVersion.value);
		// console.log("V2 Response:", v2Response);

		// Apply version transformations based on API version
		const transformedResponse = applyResponseVersionChanges<CheckResult>({
			input: v2Response,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Check,
		});

		// console.log("Transformed Response:", transformedResponse);

		return c.json(transformedResponse);

		// const { allowed, balance } = v2Response;
		// const featureToUse = allFeatures.find(
		// 	(f: Feature) => f.id === v2Response.feature_id,
		// );

		// if (allowed && req.isPublic !== true) {
		// 	if (send_event) {
		// 		await handleEventSent({
		// 			req: {
		// 				...req,
		// 				body: {
		// 					...req.body,
		// 					value: quantity,
		// 				},
		// 			},
		// 			customer_id: customer_id,
		// 			customer_data: customer_data,
		// 			event_data: {
		// 				customer_id: customer_id,
		// 				feature_id: feature_id,
		// 				value: quantity,
		// 				entity_id: entity_id,
		// 			},
		// 		});
		// 	} else if (notNullish(event_data)) {
		// 		await handleEventSent({
		// 			req,
		// 			customer_id: customer_id,
		// 			customer_data: customer_data,
		// 			event_data: {
		// 				customer_id: customer_id,
		// 				feature_id: feature_id,
		// 				...event_data,
		// 			},
		// 		});
		// 	}
		// }

		// let preview;
		// if (req.body.with_preview) {
		// 	try {
		// 		preview = await getCheckPreview({
		// 			db,
		// 			allowed,
		// 			balance: notNullish(balance) ? balance : undefined,
		// 			feature: featureToUse!,
		// 			cusProducts,
		// 			allFeatures,
		// 		});
		// 	} catch (error) {
		// 		logger.error("Failed to get check preview", error);
		// 		console.error(error);
		// 	}
		// }

		// if (req.apiVersion.gte(ApiVersion.V1_1)) {
		// 	res.status(200).json({
		// 		...v2Response,
		// 		preview,
		// 	});
		// } else {
		// 	res.status(200).json({
		// 		...v1Response,
		// 		preview,
		// 	});
		// }

		// const body = c.req.valid("json");
		// const res = await handleCheck(body);
		// return c.json(res);
	},
});
