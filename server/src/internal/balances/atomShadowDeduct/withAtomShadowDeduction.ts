import type { CheckParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { askAtomToDeduct } from "./askAtomToDeduct.js";
import { atomShadowDeductTarget } from "./atomShadowDeductGuards.js";
import type {
	AtomDeductAnswer,
	DeductionResponse,
} from "./types/atomDeductReply.js";

/**
 * Staging only: an allowlisted org's deduction goes to the shadow Atom first, as its SDK's edge would send it, and the
 * API runs it when Atom is down or hands it back. Atom's journal reaches Autumn through /atom/tracks.append.
 */
export const withAtomShadowDeduction = async ({
	ctx,
	route,
	atomParams,
	search = "",
	idempotencyKey,
	answerOf,
	runOnApi,
}: {
	ctx: AutumnContext;
	route: "check" | "track";
	/** The deducting check Atom is asked; null when this call never goes to Atom. */
	atomParams: CheckParams | null;
	search?: string;
	idempotencyKey: string | undefined;
	/** The response Atom's answer stands for, or null when the API must run the call after all. */
	answerOf: (answer: AtomDeductAnswer) => DeductionResponse | null;
	runOnApi: (params: {
		idempotencyKey: string | undefined;
	}) => Promise<DeductionResponse>;
}): Promise<DeductionResponse> => {
	const target =
		atomParams &&
		atomShadowDeductTarget({ ctx, customerId: atomParams.customer_id });
	if (!atomParams || !target) return runOnApi({ idempotencyKey });

	// One key on both legs: a deduction Atom journaled before it went quiet is claimed once.
	const key = idempotencyKey || `atom_shadow_${ctx.id}`;
	const startedAt = performance.now();
	const reply = await askAtomToDeduct({
		target,
		params: atomParams,
		search,
		apiVersion: ctx.apiVersion,
		idempotencyKey: key,
	});
	const atomMs = performance.now() - startedAt;
	const answer = reply.kind === "answered" ? answerOf(reply) : null;
	let status: number | null = null;
	let apiError: string | null = null;
	try {
		const response = answer ?? (await runOnApi({ idempotencyKey: key }));
		status = response.status;
		return response;
	} catch (error) {
		apiError = error instanceof Error ? error.name : "unknown_failure";
		throw error;
	} finally {
		ctx.logger.info("atom_shadow_deduct", {
			type: "atom_shadow_deduct",
			org_id: ctx.org.id,
			env: ctx.env,
			route,
			customer_id: atomParams.customer_id,
			atom_reply: reply.kind,
			atom_reason: reply.kind === "answered" ? null : reply.reason,
			atom_status: reply.kind === "answered" ? reply.status : null,
			answered_by: answer ? "atom" : "api",
			status,
			api_error: apiError,
			atom_ms: Math.round(atomMs),
			latency_ms: Math.round(performance.now() - startedAt),
			key_minted: !idempotencyKey,
		});
	}
};
