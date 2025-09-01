import "./index.css";
import { PostHogProvider } from "posthog-js/react";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		{process.env.NODE_ENV === "development" ? (
			<App />
		) : (
			<PostHogProvider
				apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
				options={{
					// autocapture: false,
					// capture_pageview: false,
					// capture_pageleave: false,
					// session_recording: {}
					api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
				}}
			>
				<App />
			</PostHogProvider>
		)}
	</StrictMode>,
);
