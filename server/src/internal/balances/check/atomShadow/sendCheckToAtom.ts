import type { ApiVersionClass, CheckParams } from "@autumn/shared";
import type {
	AtomCheckReply,
	AtomShadowTarget,
} from "./types/atomShadowOutcome.js";

/** Fail fast: an Atom slower than this is the finding, not something to wait out. */
const ATOM_SHADOW_TIMEOUT_MS = 300;
/** A late reply still finishes so its keep-alive socket returns to the pool; this only bounds a stuck one. */
const ATOM_SHADOW_ABANDON_MS = 5_000;

/** Set when Atom had the API answer instead, so the body is not Atom's own. */
const FORWARDED_HEADER = "x-atom-forwarded";

const errorToReason = (error: unknown): string =>
	error instanceof Error ? error.name : "unknown_failure";

/** Resolves to a timeout after ATOM_SHADOW_TIMEOUT_MS, without aborting the request: an abort drops its socket. */
const replyWithinTimeout = (reply: Promise<AtomCheckReply>) => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<AtomCheckReply>((resolve) => {
		timer = setTimeout(
			() => resolve({ kind: "timeout" }),
			ATOM_SHADOW_TIMEOUT_MS,
		);
	});
	return Promise.race([reply, timeout]).finally(() => clearTimeout(timer));
};

/** The caller's check as the caller sent it, minus its secret key: Atom forwards nothing without one. */
export const sendCheckToAtom = ({
	target,
	params,
	search,
	apiVersion,
}: {
	target: AtomShadowTarget;
	params: CheckParams;
	search: string;
	apiVersion: ApiVersionClass;
}): Promise<AtomCheckReply> =>
	replyWithinTimeout(requestCheck({ target, params, search, apiVersion }));

const requestCheck = async ({
	target,
	params,
	search,
	apiVersion,
}: Parameters<typeof sendCheckToAtom>[0]): Promise<AtomCheckReply> => {
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
				signal: AbortSignal.timeout(ATOM_SHADOW_ABANDON_MS),
			},
		);
		const forwardReason = response.headers.get(FORWARDED_HEADER);
		if (forwardReason || !response.ok) {
			await response.arrayBuffer();
			return forwardReason
				? { kind: "atom_error", reason: `forwarded_${forwardReason}` }
				: { kind: "atom_error", reason: `http_${response.status}` };
		}
		return { kind: "answered", body: await response.json() };
	} catch (error) {
		if (errorToReason(error) === "TimeoutError") return { kind: "timeout" };
		return { kind: "atom_error", reason: errorToReason(error) };
	}
};
