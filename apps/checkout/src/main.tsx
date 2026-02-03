import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CheckoutBackground } from "./components/checkout/CheckoutBackground";
import { ThemeProvider } from "./components/theme-provider";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
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
					<Route path="/c/:checkoutId" element={<CheckoutPage />} />
					<Route path="*" element={<NotFound />} />
				</Routes>
			</BrowserRouter>
		</QueryClientProvider>
	</ThemeProvider>,
);

function NotFound() {
	return (
		<CheckoutBackground>
			<div className="min-h-screen flex items-center justify-center p-4">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Page not found</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground">
							The checkout page you're looking for doesn't exist.
						</p>
					</CardContent>
				</Card>
			</div>
		</CheckoutBackground>
	);
}
