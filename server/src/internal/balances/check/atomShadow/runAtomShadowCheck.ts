import { isDeepStrictEqual } from "node:util";
import { type CheckParams, stripInternalFields } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isAtomAnswerableCheck, shadowAtomTarget } from "./atomShadowGuards.js";
import { sendCheckToAtom } from "./sendCheckToAtom.js";
import type {
	AtomCheckReply,
	AtomShadowOutcome,
} from "./types/atomShadowOutcome.js";

/** A body as it leaves over the wire: internal fields stripped, undefined keys gone. */
const toWireBody = (body: unknown): unknown =>
	JSON.parse(JSON.stringify(stripInternalFields({ data: body }) ?? null));

const replyToOutcome = ({
	apiResponse,
	reply,
}: {
	apiResponse: unknown;
	reply: AtomCheckReply;
}): AtomShadowOutcome => {
	if (reply.kind === "timeout") return { status: "timeout" };
	if (reply.kind === "atom_error")
		return { status: "atom_error", reason: reply.reason };
	const api = toWireBody(apiResponse);
	const atom = toWireBody(reply.body);
	if (isDeepStrictEqual(api, atom)) return { status: "match" };
	return { status: "mismatch", api_response: api, atom_response: atom };
};

/** Asks our shadow Atom the check the API just answered and logs how they compare. Never throws; logs at info so nothing pages. */
export const runAtomShadowCheck = async ({
	ctx,
	params,
	search,
	apiResponse,
}: {
	ctx: AutumnContext;
	params: CheckParams;
	search: string;
	apiResponse: unknown;
}): Promise<void> => {
	const startedAt = performance.now();
	const logOutcome = (outcome: AtomShadowOutcome) =>
		ctx.logger.info("atom_shadow_check", {
			type: "atom_shadow_check",
			org_id: ctx.org.id,
			env: ctx.env,
			customer_id: params.customer_id,
			entity_id: params.entity_id ?? null,
			latency_ms: Math.round(performance.now() - startedAt),
			...outcome,
		});
	try {
		if (!isAtomAnswerableCheck({ ctx, params })) return;
		const target = shadowAtomTarget({
			ctx,
			customerId: params.customer_id,
		});
		if (!target) return;
		const reply = await sendCheckToAtom({
			target,
			params,
			search,
			apiVersion: ctx.apiVersion,
		});
		logOutcome(replyToOutcome({ apiResponse, reply }));
	} catch (error) {
		logOutcome({
			status: "atom_error",
			reason: error instanceof Error ? error.name : "shadow_failed",
		});
	}
};
