import type {
	BetterAuthOptions,
	GenericEndpointContext,
	Session,
} from "better-auth";

export const afterSessionDeleted = async (
	_session: Session,
	context: GenericEndpointContext<BetterAuthOptions> | null,
) => {
	try {
		if (!context) return;

		if (process.env.NODE_ENV !== "production") return;

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
