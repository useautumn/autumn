import "scraps-ui/scraps.css";
import "@autumn/ui/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { routeChunkForPath } from "./app/routeChunks";
import { ThemeProvider } from "./contexts/ThemeProvider";
import { reportRenderError } from "./lib/errorReporting";
import { queryPersistOptions } from "./lib/queryPersistence";
import { reloadOnStaleChunk } from "./utils/staleChunkReload";

declare const __APP_ENV__: string;

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

// Restore without holding queries back: the boot script has usually fetched fresher data already,
// and hydration never replaces data newer than what it restores.
persistQueryClient({ queryClient, ...queryPersistOptions });

// Fetch the landing page's chunk alongside the session check rather than after it.
routeChunkForPath(window.location.pathname)?.preload();

createRoot(document.getElementById("root")!, {
	onUncaughtError: reportRenderError,
	onCaughtError: reportRenderError,
}).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<ThemeProvider>
				<App />
				{/* <ReactQueryDevtools initialIsOpen={false} /> */}
			</ThemeProvider>
		</QueryClientProvider>
	</StrictMode>,
);
