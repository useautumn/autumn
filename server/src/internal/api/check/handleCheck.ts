import {
	AffectedResource,
	ApiVersion,
	applyResponseVersionChanges,
	CheckParamsSchema,
	CheckQuerySchema,
	type CheckResponseV3,
	type ParsedCheckParams,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { parseCheckParamsForLock } from "@/internal/balances/utils/lock/parseCheckParamsForLock.js";
import { getCheckDataOrFallbackResponse } from "./checkUtils/getCheckDataOrFallbackResponse.js";
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
		const rawBody = c.req.valid("json");
		const ctx = c.get("ctx");

		const body: ParsedCheckParams = parseCheckParamsForLock({
			params: rawBody,
		});

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

		const checkDataResult = await getCheckDataOrFallbackResponse({
			ctx,
			body,
			requiredBalance,
		});

		const { checkData, fallbackResponse } = checkDataResult;
		if (!checkData) {
			return c.json(fallbackResponse);
		}

		let response: CheckResponseV3;
		if (send_event || body.lock?.enabled) {
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

		const transformedResponse = applyResponseVersionChanges<CheckResponseV3>({
			input: response,
			targetVersion: ctx.apiVersion,
			resource: AffectedResource.Check,
			legacyData: {
				noCusEnts:
					checkData.apiBalance === undefined && checkData.apiFlag === undefined,
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
