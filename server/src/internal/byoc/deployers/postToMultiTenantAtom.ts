import { ErrCode, RecaseError } from "@autumn/shared";
import type {
	MultiTenantAtomAddress,
	MultiTenantAtomRoute,
} from "./types/multiTenantAtom.js";

const MULTI_TENANT_ATOM_TIMEOUT_MS = 2000;
const ADMIN_TOKEN_HEADER = "x-atom-admin-token";

const multiTenantAtomUnavailable = ({
	atom,
	route,
	detail,
}: {
	atom: MultiTenantAtomAddress;
	route: MultiTenantAtomRoute;
	detail: string;
}) =>
	new RecaseError({
		message: `The multi-tenant Atom at ${atom.atomUrl} did not answer ${route}.`,
		code: ErrCode.ByocUnavailable,
		statusCode: 503,
		data: { route, detail },
	});

/** One call to a multi-tenant Atom's admin routes; anything but a 2xx is a 503 carrying what the Atom said. */
export const postToMultiTenantAtom = async ({
	atom,
	route,
	body,
}: {
	atom: MultiTenantAtomAddress;
	route: MultiTenantAtomRoute;
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
			signal: AbortSignal.timeout(MULTI_TENANT_ATOM_TIMEOUT_MS),
		});
	} catch (error) {
		throw multiTenantAtomUnavailable({ atom, route, detail: String(error) });
	}
	if (response.ok) return response.json();
	throw multiTenantAtomUnavailable({
		atom,
		route,
		detail: await response.text(),
	});
};
