import {
	type FullSubject,
	InsufficientBalanceError,
	type TrackParams,
	type TrackResponseV3,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	BalanceShadow,
	BalanceShadowConfig,
	BalanceShadowSource,
} from "./balanceShadowTypes.js";
import {
	type BalanceShadowPlan,
	prepareBalanceShadowTrack,
} from "./prepareBalanceShadowTrack.js";

export type BalanceShadowSession = {
	config: BalanceShadowConfig;
	mirror: BalanceShadow;
};

export async function runWithBalanceShadow({
	ctx,
	body,
	fullSubject,
	session,
	now = Date.now,
	run,
}: {
	ctx: AutumnContext;
	body: TrackParams;
	fullSubject: FullSubject;
	session?: BalanceShadowSession;
	now?: () => number;
	run: () => Promise<TrackResponseV3>;
}): Promise<TrackResponseV3> {
	if (!session) return run();
	const { config, mirror } = session;
	const context = {
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: body.customer_id,
		featureId: body.feature_id,
		requestId: ctx.id,
	};
	function record(event: Record<string, unknown>): void {
		try {
			mirror.record({ ...context, ...event });
		} catch {
			/* Logging cannot change the live result. */
		}
	}
	let plan: BalanceShadowPlan;
	try {
		plan = prepareBalanceShadowTrack({
			ctx,
			body,
			fullSubject,
			config,
			now: now(),
		});
	} catch {
		record({ event: "skipped", reason: "preparation_failed" });
		return run();
	}
	if (plan.kind !== "copy") {
		if (plan.kind === "skip") record({ event: "skipped", reason: plan.reason });
		return run();
	}
	const command = plan.command;
	function submit(source: BalanceShadowSource): void {
		try {
			if (now() >= config.expiresAt) {
				record({ event: "skipped", reason: "window_expired" });
				return;
			}
			mirror.submit({ command, source });
		} catch {
			record({ event: "skipped", reason: "handoff_failed" });
		}
	}
	let response: TrackResponseV3;
	try {
		response = await run();
	} catch (error) {
		if (error instanceof InsufficientBalanceError) submit({ kind: "rejected" });
		else record({ event: "skipped", reason: "live_failure" });
		throw error;
	}
	submit({
		kind: "returned",
		remaining: response.balance?.remaining,
		usage: response.balance?.usage,
	});
	return response;
}
