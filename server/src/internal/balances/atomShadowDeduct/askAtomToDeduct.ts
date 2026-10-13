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

const ATOM_PATHS = {
	check: "/v1/balances.check",
	track: "/v1/track",
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
		return {
			kind: "answered",
			status: response.status as ContentfulStatusCode,
			body: await response.json(),
		};
	} catch (error) {
		return {
			kind: "down",
			reason: error instanceof Error ? error.name : "unknown_failure",
		};
	}
};
