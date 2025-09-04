import OnboardingView2 from "./views/onboarding2/OnboardingView2";
import CustomerView from "./views/customers/customer/CustomerView";
import CustomerProductView from "./views/customers/customer/product/CustomerProductView";
import DevScreen from "./views/developer/DevView";
import ProductView from "./views/products/product/ProductView";
import ProductsView from "./views/products/ProductsView";
import CliAuth from "./views/CliAuth";

import { AppEnv } from "@autumn/shared";
import { Otp } from "./views/cli/Otp";
import { SignIn } from "./views/auth/SignIn";
import { AcceptInvitation } from "./views/auth/AcceptInvitation";
import { BrowserRouter, Routes, Route } from "react-router";
import { AdminView } from "./views/admin/AdminView";
import { PasswordSignIn } from "./views/auth/components/PasswordSignIn";
import { AnalyticsView } from "./views/customers/customer/analytics/AnalyticsView";
import { TerminalView } from "./views/TerminalView";
import { DefaultView } from "./views/DefaultView";
import { MainLayout } from "./app/layout";
import CustomersPage from "./views/customers/CustomersPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/pw-sign-in" element={<PasswordSignIn />} />
        <Route path="/accept" element={<AcceptInvitation />} />
        <Route element={<MainLayout />}>
          <Route path="*" element={<DefaultView />} />
          <Route path="/admin" element={<AdminView />} />
          <Route path="/trmnl" element={<TerminalView />} />
          <Route path="/onboarding" element={<OnboardingView2 />} />
          <Route path="/sandbox/onboarding" element={<OnboardingView2 />} />
          <Route path="/cli-auth" element={<CliAuth />} />

          <Route
            path="/products"
            element={<ProductsView env={AppEnv.Live} />}
          />
          <Route
            path="/sandbox/products"
            element={<ProductsView env={AppEnv.Sandbox} />}
          />
          <Route path="/products/:product_id" element={<ProductView />} />
          <Route
            path="/sandbox/products/:product_id"
            element={<ProductView />}
          />

          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/sandbox/customers" element={<CustomersPage />} />
          <Route path="/customers/:customer_id" element={<CustomerView />} />
          <Route
            path="/sandbox/customers/:customer_id"
            element={<CustomerView />}
          />
          <Route
            path="/customers/:customer_id/:product_id"
            element={<CustomerProductView />}
          />
          <Route
            path="/sandbox/customers/:customer_id/:product_id"
            element={<CustomerProductView />}
          />
          <Route path="/dev" element={<DevScreen env={AppEnv.Live} />} />
          <Route
            path="/sandbox/dev"
            element={<DevScreen env={AppEnv.Sandbox} />}
          />
          <Route
            path="/analytics"
            element={<AnalyticsView env={AppEnv.Live} />}
          />
          <Route
            path="/sandbox/analytics"
            element={<AnalyticsView env={AppEnv.Sandbox} />}
          />
          <Route path="/dev/cli" element={<Otp />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
