import type { ErrorInfo } from "react";

declare const __APP_ENV__: string;

// Sazabi ingests Sentry envelopes, so its DSN is primary; a set VITE_SENTRY_DSN also gets a copy of every event.
const errorReportingDsns = [
	import.meta.env.VITE_SAZABI_DSN,
	import.meta.env.VITE_SENTRY_DSN,
].filter((dsn): dsn is string => Boolean(dsn));

type SentryModule = typeof import("@sentry/react");

let sentryLoad: Promise<SentryModule | null> | undefined;

/** Sentry loads off the startup path; a failed download is retried by the next report instead of disabling reporting. */
const withSentry = (use: (Sentry: SentryModule) => void) => {
	sentryLoad ??= import("@sentry/react").then(
		(Sentry) => {
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
		},
		() => {
			sentryLoad = undefined;
			return null;
		},
	);
	void sentryLoad.then((Sentry) => Sentry && use(Sentry));
};

// Start loading now so global handlers are installed early.
withSentry(() => {});

/** React 19 routes render errors through these root hooks, not window.onerror, so the error reporter must hear them here. */
export const reportRenderError = (error: unknown, errorInfo: ErrorInfo) => {
	console.error(error, errorInfo.componentStack);
	withSentry((Sentry) =>
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
	withSentry((Sentry) => {
		Sentry.setUser({
			email: user.email ?? "unknown_email",
			name: user.name ?? "unknown_name",
			id: user.id ?? "unknown_user",
		});
		Sentry.setTags({ org_id: orgId ?? "unknown_org" });
	});
};
