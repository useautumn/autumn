import "scraps-ui/scraps.css";
import "@autumn/ui/styles.css";
import * as Sentry from "@sentry/react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { routeChunkForPath } from "./app/routeChunks";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { queryPersistOptions } from "./lib/queryPersistence";
import { reloadOnStaleChunk } from "./utils/staleChunkReload";

declare const __APP_ENV__: string;

// Sazabi ingests Sentry envelopes, so its DSN is primary; a set VITE_SENTRY_DSN also gets a copy of every event.
const errorReportingDsns = [
	import.meta.env.VITE_SAZABI_DSN,
	import.meta.env.VITE_SENTRY_DSN,
].filter((dsn): dsn is string => Boolean(dsn));

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

declare const __WORKTREE_NUM__: string;
if (__APP_ENV__ === "prod") {
	document.title = "Autumn (P)";
} else if (__APP_ENV__ === "staging") {
	document.title = "Autumn (S)";
} else if (__APP_ENV__ === "dev") {
	document.title = `Autumn (wt${__WORKTREE_NUM__})`;
}

window.addEventListener("vite:preloadError", reloadOnStaleChunk);

// The dashboard used AutumnProvider's client until it shared this one, so keep its defaults.
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60,
			retry: false,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		},
	},
});

// Fetch the landing page's chunk alongside the session check rather than after it.
void routeChunkForPath(window.location.pathname)?.preload();

/** React 19 routes render errors through these root hooks, not window.onerror, so the error reporter must hear them here. */
const reportRenderError = Sentry.reactErrorHandler((error, errorInfo) => {
	console.error(error, errorInfo.componentStack);
});

createRoot(document.getElementById("root")!, {
	onUncaughtError: reportRenderError,
	onCaughtError: reportRenderError,
}).render(
	<StrictMode>
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={queryPersistOptions}
		>
			<ThemeProvider>
				<App />
				{/* <ReactQueryDevtools initialIsOpen={false} /> */}
			</ThemeProvider>
		</PersistQueryClientProvider>
	</StrictMode>,
);
