import {
	AffectedResource,
	ApiVersion,
	type CheckParams,
	CheckParamsSchema,
	CheckQuerySchema,
	type CheckResponseV3,
	type ParsedCheckParams,
} from "@autumn/shared";
import { isRetryableDbError } from "@/db/dbUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { parseCheckParamsForLock } from "@/internal/balances/utils/lock/parseCheckParamsForLock.js";
import { getCheckData } from "./checkUtils/getCheckData.js";
import { getRetryableCheckFallbackResponse } from "./checkUtils/getRetryableCheckFallbackResponse.js";
import { getV2CheckResponse } from "./checkUtils/getV2CheckResponse.js";
import { transformCheckResponse } from "./checkUtils/transformCheckResponse.js";
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

		let checkData: Awaited<ReturnType<typeof getCheckData>>;
		try {
			checkData = await getCheckData({
				ctx,
				body: body as CheckParams & { feature_id: string },
				requiredBalance,
			});
		} catch (error) {
			if (!isRetryableDbError({ error })) {
				throw error;
			}

			return c.json(
				getRetryableCheckFallbackResponse({
					ctx,
					body,
					requiredBalance,
				}),
			);
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

		const transformedResponse = transformCheckResponse({
			ctx,
			response,
			featureToUse: checkData.featureToUse,
			noCusEnts:
				checkData.apiBalance === undefined && checkData.apiFlag === undefined,
		});

		return c.json({
			...transformedResponse,
			preview,
			// lock_id: body.lock?.lock_id ?? undefined,
		});
	},
});
