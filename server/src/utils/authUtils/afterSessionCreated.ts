export const afterSessionCreated = async (
	session: { userId: string },
	context: any,
) => {
	console.log("Running afterSessionCreated for user ", session.userId);
	try {
		if (!context) return;

		// In dev, the Vite dashboard sets this cookie client-side (localhost
		// doesn't support cross-port cookie sharing via Set-Cookie headers).
		if (process.env.NODE_ENV !== "production") return;

		// Set a non-httpOnly hint cookie on the root domain so the landing
		// page (useautumn.com) can detect that the user is logged in on app.useautumn.com.
		context.setCookie("logged_in_hint", "1", {
			domain: ".useautumn.com",
			path: "/",
			maxAge: 60 * 60 * 24 * 7, // 7 days
			secure: true,
			sameSite: "lax",
			httpOnly: false,
		});
	} catch (_) {
		console.error("Error running afterSessionCreated", { error: _ });
	}
};
