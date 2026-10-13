import type { ApiVersionClass, CheckParams } from "@autumn/shared";
import { ATOM_FORWARDED_HEADER, postCheckToAtom } from "./postCheckToAtom.js";
import type {
	AtomCheckReply,
	AtomShadowTarget,
} from "./types/atomShadowOutcome.js";

/** Fail fast: an Atom slower than this is the finding, not something to wait out. */
const ATOM_SHADOW_TIMEOUT_MS = 300;
/** A late reply still finishes so its keep-alive socket returns to the pool; this only bounds a stuck one. */
const ATOM_SHADOW_ABANDON_MS = 5_000;
/** Past this many open requests a check is shed as a timeout rather than dialled: bounds the Atom's queue below the timeout. */
const ATOM_SHADOW_MAX_IN_FLIGHT = 16;

let requestsInFlight = 0;

/** This process's Atom requests still open, late ones past their timeout included. */
export const atomRequestsInFlight = () => requestsInFlight;

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

/** The caller's check, shed past ATOM_SHADOW_MAX_IN_FLIGHT and timed out at ATOM_SHADOW_TIMEOUT_MS. */
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
	requestsInFlight >= ATOM_SHADOW_MAX_IN_FLIGHT
		? Promise.resolve({ kind: "timeout", shed: true })
		: replyWithinTimeout(requestCheck({ target, params, search, apiVersion }));

const requestCheck = async ({
	target,
	params,
	search,
	apiVersion,
}: Parameters<typeof sendCheckToAtom>[0]): Promise<AtomCheckReply> => {
	requestsInFlight++;
	try {
		const response = await postCheckToAtom({
			target,
			params,
			search,
			apiVersion,
			signal: AbortSignal.timeout(ATOM_SHADOW_ABANDON_MS),
		});
		const forwardReason = response.headers.get(ATOM_FORWARDED_HEADER);
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
	} finally {
		requestsInFlight--;
	}
};
