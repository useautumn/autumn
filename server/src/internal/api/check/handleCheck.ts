import {
	AffectedResource,
	ApiVersion,
	applyResponseVersionChanges,
	type CheckParams,
	CheckParamsSchema,
	CheckQuerySchema,
	type CheckResponseV3,
	type ParsedCheckParams,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withBalanceWorkerFailOpen } from "@/internal/balances/balanceWorker/failOpen/withBalanceWorkerFailOpen.js";
import { runBalanceWorkerCheck } from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import { runCheckWithRollout } from "@/internal/balances/check/index.js";
import { parseCheckParamsForLock } from "@/internal/balances/utils/lock/parseCheckParamsForLock.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import {
	type CheckFailOpenReason,
	getCheckFailOpenFallback,
} from "./checkUtils/getCheckFailOpenFallback.js";
import {
	type CheckResponseWithPreview,
	getCheckPreview,
} from "./getCheckPreview.js";
import { handleProductCheck } from "./handlers/handleProductCheck.js";

const DEFAULT_REQUIRED_BALANCE = 1;
// Legacy checks fail open past this budget; worker checks use their client deadline.
const CHECK_FAIL_OPEN_TIMEOUT_MS = 3_000;

/** The allowed fallback a check answers with when it can't reach its balances. */
const checkFailOpenResponse = ({
	ctx,
	params,
	error,
	reason,
}: {
	ctx: AutumnContext;
	params: CheckParams;
	error: unknown;
	reason: CheckFailOpenReason;
}) => {
	const body = parseCheckParamsForLock({ params });
	return getCheckFailOpenFallback({
		ctx,
		body,
		requiredBalance:
			body.required_balance ??
			body.required_quantity ??
			DEFAULT_REQUIRED_BALANCE,
		error,
		reason,
	});
};

export const handleCheck = createRoute({
	scopes: [Scopes.Balances.Read],
	failOpen: {
		timeoutMs: CHECK_FAIL_OPEN_TIMEOUT_MS,
		// Worker checks fail open on their own, past their client deadline. Lock checks
		// must settle their reservation; product checks return a non-feature shape.
		skip: (c) => {
			const body = c.req.valid("json");
			const ctx = c.get("ctx");
			return Boolean(
				isBalanceWorkerRolloutEnabled({ ctx, customerId: body.customer_id }) ||
					body.lock?.enabled ||
					body.product_id,
			);
		},
		respond: (c) =>
			c.json(
				checkFailOpenResponse({
					ctx: c.get("ctx"),
					params: c.req.valid("json"),
					error: new Error(
						`check exceeded the ${CHECK_FAIL_OPEN_TIMEOUT_MS}ms blanket fail-open timeout`,
					),
					reason: "route_timeout",
				}),
				202,
			),
	},
	routeGroup: RouteGroup.Balances,
	versionedQuery: {
		latest: CheckQuerySchema,
		[ApiVersion.V1_2]: CheckQuerySchema,
	},
	resource: AffectedResource.Check,
	body: CheckParamsSchema,
	handler: async (c) => {
		const rawBody = c.req.valid("json");
		const ctx = c.get("ctx");

		// Plans, not balances, answer a product check, so it runs the same on both routes.
		if (rawBody.product_id) {
			const body = parseCheckParamsForLock({ params: rawBody });
			return c.json(
				await handleProductCheck({
					ctx,
					body: { ...body, product_id: rawBody.product_id },
				}),
			);
		}

		if (
			isBalanceWorkerRolloutEnabled({ ctx, customerId: rawBody.customer_id })
		) {
			const runOnWorker = () => runBalanceWorkerCheck({ ctx, body: rawBody });
			// A lock must settle its reservation, so a lock check never answers without the worker.
			if (rawBody.lock?.enabled) return c.json(await runOnWorker());
			const { result, failedOpen } =
				await withBalanceWorkerFailOpen<CheckResponseWithPreview>({
					ctx,
					source: "check",
					run: runOnWorker,
					fallback: async ({ error, reason }) =>
						checkFailOpenResponse({ ctx, params: rawBody, error, reason }),
				});
			return c.json(result, failedOpen ? 202 : 200);
		}

		const body: ParsedCheckParams = parseCheckParamsForLock({
			params: rawBody,
		});

		const {
			customer_id,
			entity_id,
			required_quantity,
			required_balance,
			with_preview,
		} = body;

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
					allowed: response.allowed,
					apiBalance: checkData.apiBalance,
					feature: checkData.featureToUse,
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
