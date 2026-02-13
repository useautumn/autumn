import {
	AffectedResource,
	ApiVersion,
	applyResponseVersionChanges,
	type CheckParams,
	CheckParamsSchema,
	CheckQuerySchema,
	type CheckResponseV3,
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

		let response: CheckResponseV3;
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

		// Version changes will transform V3 -> V2 -> V1 -> V0 based on target API version
		const transformedResponse = applyResponseVersionChanges<CheckResponseV3>({
			input: response,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Check,
			legacyData: {
				noCusEnts: checkData.apiBalance === undefined,
				featureToUse: checkData.featureToUse,
			},
			ctx,
		});

		return c.json({
			...transformedResponse,
			preview,
		});
	},
});
