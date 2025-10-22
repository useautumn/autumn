import { CheckParamsSchema } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { handleProductCheck } from "./handlers/handleProductCheck.js";

export const handleCheck = createRoute({
	body: CheckParamsSchema,
	handler: async (c) => {
		console.log("=== HANDLER REACHED ===");
		const body = c.req.valid("json");
		console.log("=== VALIDATED BODY ===", body);
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

		console.log(`Feature ID: ${feature_id}, Product ID: ${product_id}`);

		// Legacy path - product check
		if (product_id) {
			const checkProductResult = await handleProductCheck({
				ctx: c.get("ctx"),
				body: { ...body, product_id }, // Ensure product_id is passed as string
			});
			return c.json(checkProductResult);
		}

		// const requiredBalance = notNullish(required_balance)
		// 	? required_balance
		// 	: notNullish(required_quantity)
		// 		? required_quantity
		// 		: null;

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

		// const {
		// 	fullCus,
		// 	cusEnts,
		// 	feature,
		// 	creditSystems,
		// 	org,
		// 	cusProducts,
		// 	allFeatures,
		// } = await getCheckData({ req });

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

		// const v2Response = await getV2CheckResponse({
		// 	fullCus,
		// 	cusEnts,
		// 	feature,
		// 	creditSystems,
		// 	org,
		// 	cusProducts,
		// 	requiredBalance,
		// 	apiVersion: req.apiVersion,
		// });

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

		return c.json({ success: true });
		// const body = c.req.valid("json");
		// const res = await handleCheck(body);
		// return c.json(res);
	},
});
