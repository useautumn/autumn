import {
	AffectedResource,
	applyResponseVersionChanges,
	type CheckParams,
	CheckParamsSchema,
	type CheckResult,
	notNullish,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getTrackFeatureDeductions } from "../../balances/track/trackUtils/getFeatureDeductions.js";
import { runDeductionTx } from "../../balances/track/trackUtils/runDeductionTx.js";
import { getCheckData } from "./checkUtils/getCheckData.js";
import { getV2CheckResponse } from "./checkUtils/getV2CheckResponse.js";
import { getCheckPreview } from "./getCheckPreview.js";
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
			with_preview,
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

		const checkData = await getCheckData({
			ctx,
			body: body as CheckParams & { feature_id: string },
		});

		const v2Response = await getV2CheckResponse({
			ctx,
			checkData,
			requiredBalance,
		});

		const preview = with_preview
			? await getCheckPreview({
					db: ctx.db,
					allowed: v2Response.allowed,
					balance: notNullish(v2Response.balance)
						? v2Response.balance
						: undefined,
					feature: checkData.featureToUse!,
					cusProducts: checkData.cusProducts,
					allFeatures: ctx.features,
				})
			: undefined;

		if (v2Response.allowed && ctx.isPublic !== true) {
			if (send_event && feature_id) {
				const featureDeductions = getTrackFeatureDeductions({
					ctx,
					featureId: feature_id,
					value: requiredBalance,
				});

				await runDeductionTx({
					ctx,
					customerId: body.customer_id,
					entityId: body.entity_id,
					deductions: featureDeductions,
					overageBehaviour: "cap",
					eventInfo: {
						event_name: feature_id,
						value: requiredBalance,
						properties: body.properties,
					},
				});
				// await handleEventSent({
				// 	req: {
				// 		...ctx,
				// 		body: {
				// 			...body,
				// 			value: requiredBalance,
				// 		},
				// 	},
				// 	customer_id: customer_id,
				// 	customer_data: customer_data,
				// 	event_data: {
				// 		customer_id: customer_id,
				// 		feature_id: feature_id,
				// 		value: requiredBalance,
				// 		entity_id: entity_id,
				// 	},
				// });
			}

			// else if (notNullish(event_data)) {
			// 	await handleEventSent({
			// 		req,
			// 		customer_id: customer_id,
			// 		customer_data: customer_data,
			// 		event_data: {
			// 			customer_id: customer_id,
			// 			feature_id: feature_id,
			// 			...event_data,
			// 		},
			// 	});
			// }
		}

		// Apply version transformations based on API version
		const transformedResponse = applyResponseVersionChanges<CheckResult>({
			input: v2Response,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Check,
			legacyData: {
				noCusEnts: checkData.cusEnts.length === 0,
				featureToUse: checkData.featureToUse,
			},
		});

		return c.json({
			...transformedResponse,
			preview,
		});
	},
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
