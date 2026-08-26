import type { FullSubject, TrackParams, TrackResponseV3 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	resolveMeteringRouting,
	routesTracks,
} from "@/internal/metering/routing/meteringRouting.js";
import { logMeteringRoutingDecision } from "@/internal/metering/routing/meteringRoutingLog.js";
import { postMeteringWorkerTrack } from "@/internal/metering/routing/meteringWorkerClient.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { runRedisTrackV3 } from "./runRedisTrackV3.js";

/** The worker's /track speaks one feature per call. A track that fans out
 *  across credit systems, sets an absolute target balance, or takes a lock has
 *  no equivalent there, so it stays on Redis whatever the mode says. */
const toSingleDeduction = ({
	featureDeductions,
}: {
	featureDeductions: FeatureDeduction[];
}): { featureId: string; value: number } | null => {
	if (featureDeductions.length !== 1) return null;

	const [only] = featureDeductions;
	if (only.targetBalance !== undefined) return null;
	if (only.lock || only.lockReceipt) return null;
	if (!Number.isFinite(only.deduction) || only.deduction <= 0) return null;

	return { featureId: only.feature.id, value: only.deduction };
};

/**
 * Dual-write, worker first. The worker's append is awaited (the caller's
 * answer depends on it), the Redis deduct is not: it runs detached purely to
 * keep the Redis balance warm enough that flipping the org back to `off` is a
 * config change rather than a rebuild. Its failures are swallowed — by the
 * time it runs, the caller already has an answer.
 */
const applyRedisDeductInBackground = ({
	ctx,
	fullSubject,
	featureDeductions,
	overageBehavior,
	body,
	idempotencyKey,
	refreshFullSubject,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject" | "overflow";
	body: TrackParams;
	idempotencyKey: string;
	refreshFullSubject?: () => Promise<FullSubject>;
}): void => {
	void runRedisTrackV3({
		ctx,
		fullSubject,
		featureDeductions,
		overageBehavior,
		body,
		idempotencyKey,
		refreshFullSubject,
	}).catch((error) => {
		ctx.logger.warn("[metering-routing] detached redis dual-write failed", {
			type: "metering_routing_dual_write_failed",
			org_id: ctx.org.id,
			env: ctx.env,
			customer_id: body.customer_id,
			error,
		});
	});
};

/**
 * Returns `null` whenever the track must stay on the Redis path — routing off,
 * an unroutable request shape, or a worker that did not answer — so the caller
 * has one branch to fall back on and the default deploy never reaches the
 * worker at all.
 */
export const runWorkerTrackV3 = async ({
	ctx,
	fullSubject,
	featureDeductions,
	overageBehavior,
	body,
	idempotencyKey,
	refreshFullSubject,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureDeductions: FeatureDeduction[];
	overageBehavior: "cap" | "reject" | "overflow";
	body: TrackParams;
	idempotencyKey: string;
	refreshFullSubject?: () => Promise<FullSubject>;
}): Promise<TrackResponseV3 | null> => {
	const routing = resolveMeteringRouting({ ctx });
	if (!routing.workerUrl || !routesTracks({ mode: routing.mode })) return null;

	const single = toSingleDeduction({ featureDeductions });
	if (!single) {
		logMeteringRoutingDecision({
			ctx,
			route: "track",
			mode: routing.mode,
			customerId: body.customer_id,
			outcome: "fallback",
			reason: "unsupported_shape",
		});
		return null;
	}

	// The same idempotency key the shadow tap seeds from, so the event the
	// worker appends here and the one the tap mirrors from the Redis write
	// below derive the same id and the fold folds exactly one of them.
	const worker = await postMeteringWorkerTrack({
		workerUrl: routing.workerUrl,
		body: {
			org_id: ctx.org.id,
			env: ctx.env,
			customer_id: body.customer_id,
			feature_id: single.featureId,
			value: single.value,
			idempotency_key: idempotencyKey,
		},
	});

	if (!worker) {
		logMeteringRoutingDecision({
			ctx,
			route: "track",
			mode: routing.mode,
			customerId: body.customer_id,
			outcome: "fallback",
			reason: "worker_unreachable",
		});
		return null;
	}

	applyRedisDeductInBackground({
		ctx,
		fullSubject,
		featureDeductions,
		overageBehavior,
		body,
		idempotencyKey,
		refreshFullSubject,
	});

	logMeteringRoutingDecision({
		ctx,
		route: "track",
		mode: routing.mode,
		customerId: body.customer_id,
		outcome: "routed",
		reason: "worker_ok",
	});

	// The fold projects a bare number, so the response carries the verdict and
	// the tracked value without a balance breakdown — the same shape a queued
	// track already returns.
	return {
		customer_id: body.customer_id,
		entity_id: body.entity_id,
		event_name: body.event_name,
		value: body.value ?? 1,
		balance: null,
	};
};
