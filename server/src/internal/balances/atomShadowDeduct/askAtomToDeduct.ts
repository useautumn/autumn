import type { ApiVersionClass } from "@autumn/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
	ATOM_FORWARDED_HEADER,
	postToAtom,
} from "../check/atomShadow/postToAtom.js";
import type { AtomShadowTarget } from "../check/atomShadow/types/atomShadowOutcome.js";
import type {
	AtomDeductCall,
	AtomDeductReply,
} from "./types/atomDeductReply.js";

/** The SDK edge's budget (packages/sdk/src/hooks/edge/edgeHTTPClient.ts EDGE_TIMEOUT_MS); past it the API deducts. */
const ATOM_DEDUCT_TIMEOUT_MS = 1_000;

/** Atom's answer to a call it would hand to the API without a secret key (apps/atom forwardToAutumn.ts). */
const NOT_FORWARDED_CODE = "atom_not_forwarded";

const isNotForwarded = ({ body }: { body: unknown }): boolean =>
	typeof body === "object" &&
	body !== null &&
	(body as { code?: unknown }).code === NOT_FORWARDED_CODE;

const ATOM_PATHS = {
	check: "/v1/balances.check",
	track: "/v1/track",
	finalize: "/v1/balances.finalize",
} as const;

/** A check names its key in the Idempotency-Key header, a track in its body, as the API reads each. */
const callToBody = ({
	call,
	idempotencyKey,
}: {
	call: AtomDeductCall;
	idempotencyKey: string;
}): unknown =>
	call.route === "track"
		? { ...call.params, idempotency_key: idempotencyKey }
		: call.params;

/** Asks the shadow Atom to deduct; a 5xx Atom sent itself, or no reply, is `down`, as the SDK's isEdgeDown reads it. */
export const askAtomToDeduct = async ({
	target,
	call,
	search,
	apiVersion,
	idempotencyKey,
}: {
	target: AtomShadowTarget;
	call: AtomDeductCall;
	search: string;
	apiVersion: ApiVersionClass;
	idempotencyKey: string;
}): Promise<AtomDeductReply> => {
	try {
		const response = await postToAtom({
			target,
			path: ATOM_PATHS[call.route],
			search,
			apiVersion,
			body: callToBody({ call, idempotencyKey }),
			idempotencyKey,
			signal: AbortSignal.timeout(ATOM_DEDUCT_TIMEOUT_MS),
		});
		const forwardReason = response.headers.get(ATOM_FORWARDED_HEADER);
		if (forwardReason || response.status >= 500) {
			await response.arrayBuffer();
			return forwardReason
				? { kind: "forwarded", reason: forwardReason }
				: { kind: "down", reason: `http_${response.status}` };
		}
		const body: unknown = await response.json();
		// This leg is keyless, so Atom's handback reaches us as its own refusal; a replica hop drops the header.
		if (isNotForwarded({ body }))
			return { kind: "forwarded", reason: NOT_FORWARDED_CODE };
		return {
			kind: "answered",
			status: response.status as ContentfulStatusCode,
			body,
		};
	} catch (error) {
		return {
			kind: "down",
			reason: error instanceof Error ? error.name : "unknown_failure",
		};
	}
};
