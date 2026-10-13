import type { ApiVersionClass, CheckParams } from "@autumn/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
	ATOM_FORWARDED_HEADER,
	postCheckToAtom,
} from "../check/atomShadow/postCheckToAtom.js";
import type { AtomShadowTarget } from "../check/atomShadow/types/atomShadowOutcome.js";
import type { AtomDeductReply } from "./types/atomDeductReply.js";

/** The SDK edge's budget (packages/sdk/src/hooks/edge/edgeHTTPClient.ts EDGE_TIMEOUT_MS); past it the API deducts. */
const ATOM_DEDUCT_TIMEOUT_MS = 1_000;

/** Asks the shadow Atom to deduct; a 5xx Atom sent itself, or no reply, is `down`, as the SDK's isEdgeDown reads it. */
export const askAtomToDeduct = async ({
	target,
	params,
	search,
	apiVersion,
	idempotencyKey,
}: {
	target: AtomShadowTarget;
	params: CheckParams;
	search: string;
	apiVersion: ApiVersionClass;
	idempotencyKey: string;
}): Promise<AtomDeductReply> => {
	try {
		const response = await postCheckToAtom({
			target,
			params,
			search,
			apiVersion,
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
