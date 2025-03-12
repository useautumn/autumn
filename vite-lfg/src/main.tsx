import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ClerkProvider } from "@clerk/clerk-react";
import { BrowserRouter, Route, Routes } from "react-router";
import { MainLayout } from "./app/layout.tsx";
import CustomersView from "./views/customers/CustomersView.tsx";
import { AppEnv } from "@autumn/shared";
import ProductsView from "./views/products/ProductsView.tsx";

// const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const PUBLISHABLE_KEY =
  "pk_test_bWFzc2l2ZS1naG91bC01OS5jbGVyay5hY2NvdW50cy5kZXYk";
if (!PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            {/* <Route path="/" element={<CustomersPage />} /> */}
            <Route path="/" element={<CustomersView env={AppEnv.Sandbox} />} />
            <Route
              path="/products"
              element={<ProductsView env={AppEnv.Sandbox} />}
            />
            {/* <Route path="/features" element={<CustomersPage />} /> */}
            {/* <Route path="/settings" element={<SettingsPage />} /> */}
          </Route>
        </Routes>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>
);
