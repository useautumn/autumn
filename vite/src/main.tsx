import "./index.css";
import "./styles/button.css";

import "./styles/form/base.css";
import "./styles/form/effects.css";
import "./styles/form/states.css";

import "./styles/typography.css";
import "./styles/custom.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PostHogProvider } from "posthog-js/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const queryClient = new QueryClient({
	defaultOptions: {},
});

const shouldInitializePostHog = process.env.NODE_ENV === "production";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
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
		</QueryClientProvider>
	</StrictMode>,
);
