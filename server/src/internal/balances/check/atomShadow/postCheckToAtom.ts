import type { ApiVersionClass, CheckParams } from "@autumn/shared";
import type { AtomShadowTarget } from "./types/atomShadowOutcome.js";

/** Set when Atom had the API answer instead, so the body is not Atom's own. */
export const ATOM_FORWARDED_HEADER = "x-atom-forwarded";

/** The caller's check as the caller sent it, opened with the Atom token: no secret key, so Atom forwards nothing. */
export const postCheckToAtom = ({
	target,
	params,
	search,
	apiVersion,
	idempotencyKey,
	signal,
}: {
	target: AtomShadowTarget;
	params: CheckParams;
	search: string;
	apiVersion: ApiVersionClass;
	idempotencyKey?: string;
	signal: AbortSignal;
}): Promise<Response> =>
	fetch(new URL(`/v1/balances.check${search}`, target.endpointUrl), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-token": target.token,
			"x-api-version": apiVersion.semver,
			...(idempotencyKey && { "idempotency-key": idempotencyKey }),
		},
		body: JSON.stringify(params),
		signal,
	});
