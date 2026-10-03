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

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** The top balance's remaining in any version's check body; null when unlimited, boolean or absent. */
const remainingOf = (body: unknown): number | null => {
	if (!isRecord(body)) return null;
	const { balance } = body;
	if (isRecord(balance)) {
		if (balance.unlimited === true) return null;
		// v2.1+ names it `remaining`; v2.0 named it `current_balance`.
		const remaining = balance.remaining ?? balance.current_balance;
		return typeof remaining === "number" ? remaining : null;
	}
	// v1.x puts the number at the top; v0 lists one entry per feature.
	if (typeof balance === "number")
		return body.unlimited === true ? null : balance;
	const [first] = Array.isArray(body.balances) ? body.balances : [];
	if (!isRecord(first) || first.unlimited === true) return null;
	return typeof first.balance === "number" ? first.balance : null;
};

const allowedOf = (body: unknown): boolean | null =>
	isRecord(body) && typeof body.allowed === "boolean" ? body.allowed : null;

/** Both sides' allowed and remaining on every line, so a match is countable too; Atom's are null unless it answered. */
const answerFields = ({
	apiResponse,
	reply,
}: {
	apiResponse: unknown;
	reply: AtomCheckReply | null;
}) => {
	try {
		const api = toWireBody(apiResponse);
		const atom = reply?.kind === "answered" ? toWireBody(reply.body) : null;
		return {
			api_allowed: allowedOf(api),
			atom_allowed: allowedOf(atom),
			api_remaining: remainingOf(api),
			atom_remaining: remainingOf(atom),
		};
	} catch {
		return {};
	}
};

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
	const logOutcome = (
		outcome: AtomShadowOutcome,
		reply: AtomCheckReply | null = null,
	) =>
		ctx.logger.info("atom_shadow_check", {
			type: "atom_shadow_check",
			org_id: ctx.org.id,
			env: ctx.env,
			customer_id: params.customer_id,
			entity_id: params.entity_id ?? null,
			latency_ms: Math.round(performance.now() - startedAt),
			...answerFields({ apiResponse, reply }),
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
		logOutcome(replyToOutcome({ apiResponse, reply }), reply);
	} catch (error) {
		logOutcome({
			status: "atom_error",
			reason: error instanceof Error ? error.name : "shadow_failed",
		});
	}
};
