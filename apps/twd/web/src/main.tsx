import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { ApiRequestError } from "./api/client.ts";
import { connectLiveCache } from "./api/liveCache.ts";
import { AppShell, FILL_PAGE } from "./components/appShell.tsx";
import { RouteError } from "./components/routeError.tsx";
import { TooltipProvider } from "./components/ui.tsx";
import { AccountsScreen } from "./screens/accountsScreen.tsx";
import { CostsScreen } from "./screens/costsScreen.tsx";
import { KeysScreen } from "./screens/keysScreen.tsx";
import { NewRunScreen } from "./screens/newRunScreen.tsx";
import { RunDetailScreen } from "./screens/runDetailScreen.tsx";
import { RunsScreen } from "./screens/runsScreen.tsx";
import { SettingsScreen } from "./screens/settingsScreen.tsx";
import { SignInScreen } from "./screens/signInScreen.tsx";
import "./styles.css";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: (count, error) =>
				!(error instanceof ApiRequestError && error.status < 500) && count < 2,
			refetchOnWindowFocus: false,
		},
	},
});

connectLiveCache(queryClient);

const router = createBrowserRouter([
	{
		path: "/sign-in",
		element: <SignInScreen />,
		errorElement: <RouteError />,
	},
	{
		element: <AppShell />,
		errorElement: <RouteError />,
		children: [
			{
				errorElement: <RouteError />,
				children: [
					{ path: "/", element: <RunsScreen />, handle: FILL_PAGE },
					{ path: "/runs/new", element: <NewRunScreen /> },
					{
						path: "/runs/:id",
						element: <RunDetailScreen />,
						handle: FILL_PAGE,
					},
					{ path: "/costs", element: <CostsScreen /> },
					{ path: "/keys", element: <KeysScreen />, handle: FILL_PAGE },
					{ path: "/accounts", element: <AccountsScreen />, handle: FILL_PAGE },
					{ path: "/settings", element: <SettingsScreen /> },
				],
			},
		],
	},
]);

const root = document.getElementById("root");
if (root)
	createRoot(root).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider delay={150}>
					<RouterProvider router={router} />
				</TooltipProvider>
			</QueryClientProvider>
		</StrictMode>,
	);
