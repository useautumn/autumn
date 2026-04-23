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
import { runCheckWithRollout } from "@/internal/balances/check/index.js";
import { parseCheckParamsForLock } from "@/internal/balances/utils/lock/parseCheckParamsForLock.js";
import { getCheckPreview } from "./getCheckPreview.js";
import { handleProductCheck } from "./handlers/handleProductCheck.js";

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

		const result = await runCheckWithRollout({
			ctx,
			body,
			requiredBalance,
		});
		if (!result.checkData) {
			return c.json(result.response, 202);
		}

		const { checkData, response } = result;

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
				noCusEnts:
					checkData.apiBalance === undefined && checkData.apiFlag === undefined,
				featureToUse: checkData.featureToUse,
			},
			ctx,
		});

		return c.json({
			...transformedResponse,
			preview,
			// lock_id: body.lock?.lock_id ?? undefined,
		});
	},
});
