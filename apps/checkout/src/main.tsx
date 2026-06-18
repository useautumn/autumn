import {
	ATTACH_CHECKOUT_PATH,
	LONG_LIVED_CHECKOUT_PATH,
	UPDATE_SUBSCRIPTION_CHECKOUT_PATH,
} from "@autumn/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./components/theme-provider";
import { useDevThemeToggle } from "./hooks/useDevThemeToggle";
import { CheckoutPage } from "./pages/CheckoutPage";
import { LongLivedCheckoutPage } from "./pages/LongLivedCheckoutPage";
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
						path={`/${ATTACH_CHECKOUT_PATH}/:checkoutId`}
						element={<CheckoutPage routeMode="attach" />}
					/>
					<Route
						path={`/${UPDATE_SUBSCRIPTION_CHECKOUT_PATH}/:checkoutId`}
						element={<CheckoutPage routeMode="update_subscription" />}
					/>
					<Route
						path={`/${LONG_LIVED_CHECKOUT_PATH}/:checkoutId`}
						element={<LongLivedCheckoutPage />}
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
