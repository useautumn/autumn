import type { ApiVersionClass, CheckParams } from "@autumn/shared";
import type {
	AtomCheckReply,
	AtomShadowTarget,
} from "./types/atomShadowOutcome.js";

/** Fail fast: an Atom slower than this is the finding, not something to wait out. */
const ATOM_SHADOW_TIMEOUT_MS = 300;

/** Set when Atom had the API answer instead, so the body is not Atom's own. */
const FORWARDED_HEADER = "x-atom-forwarded";

const errorToReason = (error: unknown): string =>
	error instanceof Error ? error.name : "unknown_failure";

/** The caller's check as the caller sent it, minus its secret key: Atom forwards nothing without one. */
export const sendCheckToAtom = async ({
	target,
	params,
	search,
	apiVersion,
}: {
	target: AtomShadowTarget;
	params: CheckParams;
	search: string;
	apiVersion: ApiVersionClass;
}): Promise<AtomCheckReply> => {
	try {
		const response = await fetch(
			new URL(`/v1/balances.check${search}`, target.endpointUrl),
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-atom-token": target.token,
					"x-api-version": apiVersion.semver,
				},
				body: JSON.stringify(params),
				signal: AbortSignal.timeout(ATOM_SHADOW_TIMEOUT_MS),
			},
		);
		const forwardReason = response.headers.get(FORWARDED_HEADER);
		if (forwardReason)
			return { kind: "atom_error", reason: `forwarded_${forwardReason}` };
		if (!response.ok)
			return { kind: "atom_error", reason: `http_${response.status}` };
		return { kind: "answered", body: await response.json() };
	} catch (error) {
		if (errorToReason(error) === "TimeoutError") return { kind: "timeout" };
		return { kind: "atom_error", reason: errorToReason(error) };
	}
};
