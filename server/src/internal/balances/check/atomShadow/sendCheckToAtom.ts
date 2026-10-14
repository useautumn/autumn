import type { ApiVersionClass, CheckParams } from "@autumn/shared";
import type {
	AtomCheckReply,
	AtomShadowTarget,
} from "./types/atomShadowOutcome.js";

const ATOM_SHADOW_TIMEOUT_MS = 300;
const ATOM_SHADOW_ABANDON_MS = 5_000;
const ATOM_SHADOW_MAX_IN_FLIGHT = 16;

const FORWARDED_HEADER = "x-atom-forwarded";

let requestsInFlight = 0;

export const atomRequestsInFlight = () => requestsInFlight;

const errorToReason = (error: unknown): string =>
	error instanceof Error ? error.name : "unknown_failure";

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
	} finally {
		requestsInFlight--;
	}
};
