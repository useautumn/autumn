import "./index.css";
import "./styles/typography.css";
import "./styles/custom.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PostHogProvider } from "posthog-js/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const queryClient = new QueryClient({
	defaultOptions: {
		// queries: {
		//   refetchInterval: 0,
		// },
	},
});

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			{process.env.NODE_ENV === "development" ? (
				<App />
			) : (
				<PostHogProvider
					apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
					options={{ api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST }}
				>
					<App />
				</PostHogProvider>
			)}
			{/* <ReactQueryDevtools initialIsOpen={false} /> */}
		</QueryClientProvider>
	</StrictMode>,
);
