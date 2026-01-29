import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CheckoutPage } from "./pages/CheckoutPage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<Routes>
			<Route path="/c/:checkoutId" element={<CheckoutPage />} />
			<Route path="*" element={<NotFound />} />
		</Routes>
	</BrowserRouter>,
);

function NotFound() {
	return (
		<div className="checkout-container">
			<div className="checkout-card">
				<h2>Page not found</h2>
				<p>The checkout page you're looking for doesn't exist.</p>
			</div>
		</div>
	);
}
