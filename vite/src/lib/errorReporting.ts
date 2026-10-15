import type { ErrorInfo } from "react";

declare const __APP_ENV__: string;

// Sazabi ingests Sentry envelopes, so its DSN is primary; a set VITE_SENTRY_DSN also gets a copy of every event.
const errorReportingDsns = [
	import.meta.env.VITE_SAZABI_DSN,
	import.meta.env.VITE_SENTRY_DSN,
].filter((dsn): dsn is string => Boolean(dsn));

/** Sentry loads off the startup path; anything reported before it arrives waits on this. */
const sentry = import("@sentry/react").then((Sentry) => {
	Sentry.init({
		dsn: errorReportingDsns[0],
		...(errorReportingDsns.length > 1 && {
			transport: Sentry.makeMultiplexedTransport(
				Sentry.makeFetchTransport,
				() => errorReportingDsns,
			),
		}),
		// Vercel's prod build doesn't set VITE_APP_ENV, and only it carries the DSN.
		environment: __APP_ENV__ || "production",
		sendDefaultPii: true,
	});
	return Sentry;
});

/** React 19 routes render errors through these root hooks, not window.onerror, so the error reporter must hear them here. */
export const reportRenderError = (error: unknown, errorInfo: ErrorInfo) => {
	console.error(error, errorInfo.componentStack);
	void sentry.then((Sentry) =>
		Sentry.reactErrorHandler()(error, {
			componentStack: errorInfo.componentStack ?? "",
		}),
	);
};

export const setErrorReportingUser = ({
	user,
	orgId,
}: {
	user: { id?: string; email?: string | null; name?: string | null };
	orgId?: string | null;
}) => {
	void sentry.then((Sentry) => {
		Sentry.setUser({
			email: user.email ?? "unknown_email",
			name: user.name ?? "unknown_name",
			id: user.id ?? "unknown_user",
		});
		Sentry.setTags({ org_id: orgId ?? "unknown_org" });
	});
};
