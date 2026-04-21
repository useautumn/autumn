import type { GenericEndpointContext } from "@better-auth/core";
import type { BetterAuthOptions, Session } from "better-auth";

export const afterSessionDeleted = async (
	_session: Session,
	context: GenericEndpointContext<BetterAuthOptions> | null,
) => {
	try {
		if (!context) return;

		// Dev parity: the cookie is only set server-side in production, so
		// we don't need to clear it here in other environments.
		if (process.env.NODE_ENV !== "production") return;

		// Clear the landing-page hint cookie so signed-out users stop seeing
		// the "Dashboard" CTA on useautumn.com. Attributes must match the
		// original setCookie call so the browser overwrites the cookie.
		context.setCookie("logged_in_hint", "", {
			domain: ".useautumn.com",
			path: "/",
			maxAge: 0,
			secure: true,
			sameSite: "lax",
			httpOnly: false,
		});
	} catch (_) {
		console.error("Error running afterSessionDeleted", { error: _ });
	}
};
