import { ErrCode, RecaseError } from "@autumn/shared";
import type { SharedAtomAddress, SharedAtomRoute } from "./types/sharedAtom.js";

const SHARED_ATOM_TIMEOUT_MS = 2000;
const ADMIN_TOKEN_HEADER = "x-atom-admin-token";

const sharedAtomUnavailable = ({
	atom,
	route,
	detail,
}: {
	atom: SharedAtomAddress;
	route: SharedAtomRoute;
	detail: string;
}) =>
	new RecaseError({
		message: `The shared Atom at ${atom.atomUrl} did not answer ${route}.`,
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
		data: { route, detail },
	});

/** One call to a shared Atom's admin routes; anything but a 2xx is a 503 carrying what the Atom said. */
export const postToSharedAtom = async ({
	atom,
	route,
	body,
}: {
	atom: SharedAtomAddress;
	route: SharedAtomRoute;
	body: Record<string, string>;
}): Promise<unknown> => {
	let response: Response;
	try {
		response = await fetch(`${atom.atomUrl}/v1/${route}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				[ADMIN_TOKEN_HEADER]: atom.adminToken,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(SHARED_ATOM_TIMEOUT_MS),
		});
	} catch (error) {
		throw sharedAtomUnavailable({ atom, route, detail: String(error) });
	}
	if (response.ok) return response.json();
	throw sharedAtomUnavailable({ atom, route, detail: await response.text() });
};
