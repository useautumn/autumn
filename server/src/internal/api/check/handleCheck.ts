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
import { queueAtomShadowCheck } from "@/internal/balances/check/atomShadow/queueAtomShadowCheck.js";
import { runBalanceWorkerCheck } from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import { queueDeductingCheck } from "@/internal/balances/check/balanceWorker/runDeductingCheck.js";
import { runCheckWithRollout } from "@/internal/balances/check/index.js";
import { parseCheckParamsForLock } from "@/internal/balances/utils/lock/parseCheckParamsForLock.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import {
	failOpenCheckDeducts,
	queueFailOpenCheckDeduction,
} from "./checkUtils/failOpenCheckDeduction.js";
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
	deductionQueued,
}: {
	ctx: AutumnContext;
	params: CheckParams;
	error: unknown;
	reason: CheckFailOpenReason;
	deductionQueued?: boolean;
}) => {
	const body = parseCheckParamsForLock({ params });
	return getCheckFailOpenFallback({
		ctx,
		body,
		requiredBalance: requiredBalanceOfParams({ body }),
		error,
		reason,
		deductionQueued,
	});
};

const requiredBalanceOfParams = ({ body }: { body: ParsedCheckParams }) =>
	body.required_balance ?? body.required_quantity ?? DEFAULT_REQUIRED_BALANCE;

/**
 * The legacy route timeout: a `send_event` check queues its deduction before answering allowed. The handler
 * that lost the race keeps running, and the replay dedupes against it on the request id. A refused queue
 * still answers allowed: the running handler will likely deduct, and a 503 would invite a retry that
 * deducts again under a new request id.
 */
const legacyTimeoutResponse = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CheckParams;
}) => {
	const body = parseCheckParamsForLock({ params });
	const deductionQueued =
		failOpenCheckDeducts({ ctx, body }) &&
		(await queueFailOpenCheckDeduction({
			ctx,
			body,
			requiredBalance: requiredBalanceOfParams({ body }),
		}));
	return checkFailOpenResponse({
		ctx,
		params,
		error: new Error(
			`check exceeded the ${CHECK_FAIL_OPEN_TIMEOUT_MS}ms blanket fail-open timeout`,
		),
		reason: "route_timeout",
		deductionQueued,
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
		respond: async (c) =>
			c.json(
				await legacyTimeoutResponse({
					ctx: c.get("ctx"),
					params: c.req.valid("json"),
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
					fallback: async ({ error, reason }) => {
						// The check's own track, queued: the usage it allows is still recorded.
						const deducts = failOpenCheckDeducts({ ctx, body: rawBody });
						if (deducts)
							await queueDeductingCheck({
								ctx,
								body: parseCheckParamsForLock({ params: rawBody }),
							});
						return checkFailOpenResponse({
							ctx,
							params: rawBody,
							error,
							reason,
							deductionQueued: deducts,
						});
					},
				});
			if (!failedOpen)
				queueAtomShadowCheck({
					ctx,
					params: rawBody,
					search: new URL(c.req.url).search,
					apiResponse: result,
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

		const apiResponse = { ...transformedResponse, preview };
		queueAtomShadowCheck({
			ctx,
			params: rawBody,
			search: new URL(c.req.url).search,
			apiResponse,
		});
		return c.json(apiResponse);
	},
});
