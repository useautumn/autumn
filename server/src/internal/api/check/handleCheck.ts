import {
	AffectedResource,
	ApiVersion,
	applyResponseVersionChanges,
	type CheckParams,
	CheckParamsSchema,
	CheckQuerySchema,
	type CheckResponseV2,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getCheckData } from "./checkUtils/getCheckData.js";
import { getV2CheckResponse } from "./checkUtils/getV2CheckResponse.js";
import { getCheckPreview } from "./getCheckPreview.js";
import { handleProductCheck } from "./handlers/handleProductCheck.js";
import { runCheckWithTrack } from "./runCheckWithTrack.js";

const DEFAULT_REQUIRED_BALANCE = 1;
export const handleCheck = createRoute({
	versionedQuery: {
		latest: CheckQuerySchema,
		[ApiVersion.V1_2]: CheckQuerySchema,
	},
	resource: AffectedResource.Check,
	body: CheckParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		const {
			customer_id,
			feature_id,
			product_id,
			entity_id,
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
			requiredBalance,
		});

		let response: CheckResponseV2;
		if (send_event) {
			response = await runCheckWithTrack({
				ctx,
				body,
				requiredBalance,
				checkData,
			});
		} else {
			response = await getV2CheckResponse({
				checkData,
				requiredBalance,
			});
		}

		const preview = with_preview
			? await getCheckPreview({
					ctx,
					checkResponse: response,
					checkData,
					customerId: customer_id,
					entityId: entity_id,
				})
			: undefined;

		const transformedResponse = applyResponseVersionChanges<CheckResponseV2>({
			input: response,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Check,
			legacyData: {
				noCusEnts: checkData.apiBalance === undefined,
				featureToUse: checkData.featureToUse,
				cusFeatureLegacyData: checkData.cusFeatureLegacyData,
			},
		});

		return c.json({
			...transformedResponse,
			preview,
		});
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

// if (v2Response.allowed && ctx.isPublic !== true) {
// 	if (send_event && feature_id) {
// 		// console.log(
// 		// 	`Allowed is true, sending event for customer ${customer_id}, feature ${feature_id}`,
// 		// );
// 		const featureDeductions = getTrackFeatureDeductions({
// 			ctx,
// 			featureId: feature_id,
// 			value: requiredBalance,
// 		});

// 		await runTrack({
// 			ctx,
// 			body: {
// 				customer_id,
// 				entity_id,
// 				feature_id,
// 				value: requiredBalance,
// 				properties: body.properties,
// 				skip_event: body.skip_event,
// 			} satisfies TrackParams,
// 			featureDeductions,
// 		});
// 	}
// }

// Apply version transformations based on API version
