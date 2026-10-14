import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { askAtomToDeduct } from "./askAtomToDeduct.js";
import { allowedOf, atomShadowDeductTarget } from "./atomShadowDeductGuards.js";
import type {
	AtomDeductCall,
	DeductionResponse,
} from "./types/atomDeductReply.js";

/** A finalize settles a value already held, so it deducts nothing new. */
const deductionValueOf = ({
	call,
}: {
	call: AtomDeductCall;
}): number | null => {
	if (call.route === "finalize") return null;
	return call.route === "track"
		? (call.params.value ?? 1)
		: (call.params.required_balance ?? call.params.required_quantity ?? 1);
};

const lockIdOf = ({ call }: { call: AtomDeductCall }): string | null => {
	if (call.route === "finalize") return call.params.lock_id;
	return call.route === "check" ? (call.params.lock?.lock_id ?? null) : null;
};

const errorToCode = (error: unknown): string => {
	if (error instanceof RecaseError) return error.code;
	return error instanceof Error ? error.name : "unknown_failure";
};

/**
 * Staging only: an allowlisted org's deduction goes to the shadow Atom first, as its SDK's edge would send it, and the
 * API runs it when Atom is down or hands it back. Atom's journal reaches Autumn through /atom/tracks.append.
 */
export const withAtomShadowDeduction = async ({
	ctx,
	call,
	search = "",
	idempotencyKey,
	runOnApi,
}: {
	ctx: AutumnContext;
	/** The deduction Atom is asked; null when this call never goes to Atom. */
	call: AtomDeductCall | null;
	search?: string;
	idempotencyKey: string | undefined;
	runOnApi: (params: {
		idempotencyKey: string | undefined;
	}) => Promise<DeductionResponse>;
}): Promise<DeductionResponse> => {
	const target =
		call &&
		atomShadowDeductTarget({ ctx, customerId: call.params.customer_id });
	if (!call || !target) return runOnApi({ idempotencyKey });

	// One key on both legs: a deduction Atom journaled before it went quiet is claimed once.
	const key = idempotencyKey || `atom_shadow_${ctx.id}`;
	const startedAt = performance.now();
	const reply = await askAtomToDeduct({
		target,
		call,
		search,
		apiVersion: ctx.apiVersion,
		idempotencyKey: key,
	});
	const atomMs = performance.now() - startedAt;
	const atomAnswer =
		reply.kind === "answered"
			? { body: reply.body, status: reply.status }
			: null;
	let response: DeductionResponse | null = null;
	let apiError: string | null = null;
	try {
		response = atomAnswer ?? (await runOnApi({ idempotencyKey: key }));
		return response;
	} catch (error) {
		apiError = errorToCode(error);
		throw error;
	} finally {
		ctx.logger.info("atom_shadow_deduct", {
			type: "atom_shadow_deduct",
			org_id: ctx.org.id,
			env: ctx.env,
			route: call.route,
			customer_id: call.params.customer_id,
			feature_id:
				call.route === "finalize" ? null : (call.params.feature_id ?? null),
			lock_id: lockIdOf({ call }),
			// What this call deducts once acked; P1 sums it per customer against the balance moved.
			value: deductionValueOf({ call }),
			atom_reply: reply.kind,
			atom_reason: reply.kind === "answered" ? null : reply.reason,
			atom_status: reply.kind === "answered" ? reply.status : null,
			answered_by: atomAnswer ? "atom" : "api",
			status: response?.status ?? null,
			// Atom answers a track only once it deducted it.
			allowed:
				atomAnswer && call.route === "track"
					? atomAnswer.status === 202
					: allowedOf({ body: response?.body }),
			api_error: apiError,
			// The fallback reused a key Atom's hand-in already claimed: the deduction landed once, not an error.
			fallback_duplicate: apiError === ErrCode.DuplicateIdempotencyKey,
			atom_ms: Math.round(atomMs),
			latency_ms: Math.round(performance.now() - startedAt),
			key_minted: !idempotencyKey,
		});
	}
};
