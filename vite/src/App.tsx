import { AppEnv } from "@autumn/shared";
import { BrowserRouter, Routes, Route } from "react-router";
import { MainLayout } from "./app/layout";
import CustomerView from "./views/customers/customer/CustomerView";
import CustomerProductView from "./views/customers/customer/product/CustomerProductView";
import CustomersView from "./views/customers/CustomersView";
import DevScreen from "./views/developer/DevView";
import FeaturesView from "./views/features/FeaturesView";
import ConnectStripe from "./views/onboarding/ConnectStripe";
import StripePage from "./views/onboarding/StripePage";
import ProductView from "./views/products/product/ProductView";
import ProductsView from "./views/products/ProductsView";

import OnboardingView from "./views/onboarding/OnboardingView";
import { DefaultView } from "./views/DefaultView";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="*" element={<DefaultView />} />
          <Route path="/onboarding" element={<OnboardingView />} />
          <Route path="/sandbox/onboarding" element={<OnboardingView />} />

          {/* FEATURES */}
          <Route
            path="/features"
            element={<FeaturesView env={AppEnv.Live} />}
          />
          <Route
            path="/sandbox/features"
            element={<FeaturesView env={AppEnv.Sandbox} />}
          />
          {/* PRODUCTS */}
          <Route
            path="/products"
            element={<ProductsView env={AppEnv.Live} />}
          />
          <Route
            path="/sandbox/products"
            element={<ProductsView env={AppEnv.Sandbox} />}
          />
          <Route
            path="/products/:product_id"
            element={<ProductView env={AppEnv.Live} />}
          />
          <Route
            path="/sandbox/products/:product_id"
            element={<ProductView env={AppEnv.Sandbox} />}
          />

          {/* CUSTOMERS */}
          <Route
            path="/customers"
            element={<CustomersView env={AppEnv.Sandbox} />}
          />
          <Route
            path="/sandbox/customers"
            element={<CustomersView env={AppEnv.Sandbox} />}
          />

          <Route
            path="/customers/:customer_id"
            element={<CustomerView env={AppEnv.Live} />}
          />
          <Route
            path="/sandbox/customers/:customer_id"
            element={<CustomerView env={AppEnv.Sandbox} />}
          />

          {/* CUSTOMER PRODUCT */}
          <Route
            path="/customers/:customer_id/:product_id"
            element={<CustomerProductView />}
          />
          <Route
            path="/sandbox/customers/:customer_id/:product_id"
            element={<CustomerProductView />}
          />

          {/* DEVELOPER */}
          <Route path="/dev" element={<DevScreen env={AppEnv.Live} />} />
          <Route
            path="/sandbox/dev"
            element={<DevScreen env={AppEnv.Sandbox} />}
          />

          {/* STRIPE */}
          <Route path="/integrations/stripe" element={<StripePage />} />
          <Route path="/sandbox/integrations/stripe" element={<StripePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
