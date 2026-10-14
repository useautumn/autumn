import type {
	BetterAuthOptions,
	GenericEndpointContext,
	Session,
} from "better-auth";

export const afterSessionCreated = async (
	session: Session,
	context: GenericEndpointContext<BetterAuthOptions> | null,
) => {
	console.log("Running afterSessionCreated for user ", session.userId);
	try {
		if (!context) return;

		if (process.env.NODE_ENV !== "production") return;

		context.setCookie("logged_in_hint", "1", {
			domain: ".useautumn.com",
			path: "/",
			maxAge: 60 * 60 * 24 * 7,
			secure: true,
			sameSite: "lax",
			httpOnly: false,
		});
	} catch (_) {
		console.error("Error running afterSessionCreated", { error: _ });
	}
};
