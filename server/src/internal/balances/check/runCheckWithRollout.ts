import type { ParsedCheckParams } from "@autumn/shared";
import { withRedisFailOpen } from "@/external/redis/utils/withRedisFailOpen.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";
import { buildWorkerCheckResponse } from "@/internal/api/check/checkUtils/buildCheckFallbackResponse.js";
import { getCheckFailOpenFallback } from "@/internal/api/check/checkUtils/getCheckFailOpenFallback.js";
import { isFullSubjectGateRejection } from "@/internal/customers/repos/getFullSubject/getFullSubjectGate.js";
import {
	resolveMeteringRouting,
	routesChecks,
} from "@/internal/metering/routing/meteringRouting.js";
import { logMeteringRoutingDecision } from "@/internal/metering/routing/meteringRoutingLog.js";
import { fetchMeteringWorkerCheck } from "@/internal/metering/routing/meteringWorkerClient.js";
import type { CheckDataV2 } from "./checkTypes/CheckDataV2.js";
import { runCheckV2 } from "./runCheckV2.js";
import type { RunCheckResult } from "./types.js";

/**
 * Reads the balance from the metering worker instead of Redis when the org is
 * in a routing mode. Returns `null` for every failure the client collapses
 * (timeout, non-2xx, unreachable), which is the caller's signal to run the
 * Redis path as if routing were off — the worker is never allowed to fail a
 * check.
 */
const runWorkerCheck = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<RunCheckResult<CheckData | CheckDataV2> | null> => {
	const routing = resolveMeteringRouting({ ctx });
	if (!routing.workerUrl || !routesChecks({ mode: routing.mode })) return null;

	// Not every check is a read. `send_event` and lock checks commit a
	// deduction through the Redis path, and `with_preview` / `product_id` need
	// check data the fold has no equivalent of — routing any of them would
	// silently drop work, so they stay on Redis whatever the mode says.
	if (
		!body.feature_id ||
		body.product_id ||
		body.send_event ||
		body.lock?.enabled ||
		body.with_preview
	) {
		logMeteringRoutingDecision({
			ctx,
			route: "check",
			mode: routing.mode,
			customerId: body.customer_id,
			outcome: "fallback",
			reason: "unsupported_shape",
		});
		return null;
	}

	const worker = await fetchMeteringWorkerCheck({
		workerUrl: routing.workerUrl,
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: body.customer_id ?? "",
		featureId: body.feature_id,
	});

	if (!worker) {
		logMeteringRoutingDecision({
			ctx,
			route: "check",
			mode: routing.mode,
			customerId: body.customer_id,
			outcome: "fallback",
			reason: "worker_unreachable",
		});
		return null;
	}

	logMeteringRoutingDecision({
		ctx,
		route: "check",
		mode: routing.mode,
		customerId: body.customer_id,
		outcome: "routed",
		reason: "worker_ok",
	});

	return {
		checkData: null,
		routed: true,
		response: buildWorkerCheckResponse({
			ctx,
			body,
			requiredBalance,
			workerBalance: worker.balance,
		}) as Record<string, unknown>,
	};
};

export const runCheckWithRollout = async ({
	ctx,
	body,
	requiredBalance,
}: {
	ctx: AutumnContext;
	body: ParsedCheckParams;
	requiredBalance: number;
}): Promise<RunCheckResult<CheckData | CheckDataV2>> => {
	if (ctx.orgRateLimitDegraded) {
		return {
			checkData: null,
			response: getCheckFailOpenFallback({
				ctx,
				body,
				requiredBalance,
				error: new Error("org aggregate rate cap exceeded"),
				reason: "org_rate_limit",
			}) as Record<string, unknown>,
		};
	}

	// Belt and braces on the hottest route: the worker client already collapses
	// its own failures, so anything thrown here is a bug in the routing layer
	// and must still not cost the caller their answer.
	const routed = await runWorkerCheck({ ctx, body, requiredBalance }).catch(
		(error) => {
			logMeteringRoutingDecision({
				ctx,
				route: "check",
				mode: "off",
				customerId: body.customer_id,
				outcome: "fallback",
				reason: "worker_unreachable",
				error,
			});
			return null;
		},
	);
	if (routed) return routed;

	return withRedisFailOpen<RunCheckResult<CheckData | CheckDataV2>>({
		source: "runCheckWithRollout",
		run: () => runCheckV2({ ctx, body, requiredBalance }),
		alsoFailOpen: isFullSubjectGateRejection,
		fallback: (error) => ({
			checkData: null,
			response: getCheckFailOpenFallback({
				ctx,
				body,
				requiredBalance,
				error,
				reason: "dependency_error",
			}) as Record<string, unknown>,
		}),
	});
};
