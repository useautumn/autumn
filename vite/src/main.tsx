import "scraps-ui/scraps.css";
import "@autumn/ui/styles.css";
import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PostHogProvider } from "posthog-js/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./contexts/ThemeProvider";

declare const __APP_ENV__: string;

Sentry.init({
	dsn: import.meta.env.VITE_SENTRY_DSN,
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

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
		},
	},
});

const shouldInitializePostHog = process.env.NODE_ENV === "production";

/** React 19 routes render errors through these root hooks, not window.onerror, so Sentry must hear them here. */
const reportRenderError = Sentry.reactErrorHandler((error, errorInfo) => {
	console.error(error, errorInfo.componentStack);
});

createRoot(document.getElementById("root")!, {
	onUncaughtError: reportRenderError,
	onCaughtError: reportRenderError,
}).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<ThemeProvider>
				{/* <App /> */}
				{shouldInitializePostHog ? (
					<PostHogProvider
						apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
						options={{
							api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
							autocapture: false,
							capture_pageview: false,
							capture_pageleave: false,
						}}
					>
						<App />
					</PostHogProvider>
				) : (
					<App />
				)}
				{/* <ReactQueryDevtools initialIsOpen={false} /> */}
			</ThemeProvider>
		</QueryClientProvider>
	</StrictMode>,
);
