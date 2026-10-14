import type { ApiVersionClass } from "@autumn/shared";
import type { AtomShadowTarget } from "./types/atomShadowOutcome.js";

/** Set when Atom had the API answer instead, so the body is not Atom's own. */
export const ATOM_FORWARDED_HEADER = "x-atom-forwarded";
/** On a refused check: the limit the Atom's engine ran into, and why it refused. */
export const ATOM_LIMIT_TYPE_HEADER = "x-atom-limit-type";
export const ATOM_DENY_REASON_HEADER = "x-atom-deny-reason";

/** A caller's call as the caller sent it, opened with the Atom token: no secret key, so Atom forwards nothing. */
export const postToAtom = ({
	target,
	path,
	search,
	apiVersion,
	body,
	idempotencyKey,
	signal,
}: {
	target: AtomShadowTarget;
	path: "/v1/balances.check" | "/v1/track";
	search: string;
	apiVersion: ApiVersionClass;
	body: unknown;
	idempotencyKey?: string;
	signal: AbortSignal;
}): Promise<Response> =>
	fetch(new URL(`${path}${search}`, target.endpointUrl), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-token": target.token,
			"x-api-version": apiVersion.semver,
			...(idempotencyKey && { "idempotency-key": idempotencyKey }),
		},
		body: JSON.stringify(body),
		signal,
	});
