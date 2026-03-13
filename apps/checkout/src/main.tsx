import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./components/theme-provider";
import { useDevThemeToggle } from "./hooks/useDevThemeToggle";
import { CheckoutPage } from "./pages/CheckoutPage";
import "./index.css";

function DevTools() {
	useDevThemeToggle();
	return null;
}

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			staleTime: 1000 * 60, // 1 minute
		},
	},
});

createRoot(document.getElementById("root")!).render(
	<ThemeProvider defaultTheme="system" storageKey="checkout-theme">
		<DevTools />
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<Routes>
					<Route
						path="/c/:checkoutId"
						element={<CheckoutPage routeMode="attach" />}
					/>
					<Route
						path="/u/:checkoutId"
						element={<CheckoutPage routeMode="update_subscription" />}
					/>
					<Route path="*" element={<NotFound />} />
				</Routes>
			</BrowserRouter>
		</QueryClientProvider>
	</ThemeProvider>,
);

function NotFound() {
	window.location.href = "https://useautumn.com";
	return null;
}
