import { AppEnv } from "@autumn/shared";
import * as Sentry from "@sentry/react";
import { init } from "@squircle/core";
import * as React from "react";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { MainLayout } from "./app/layout";
import { OnboardingLayout } from "./app/OnboardingLayout";
import { useSession } from "./lib/auth-client";
import { identifyUser } from "./utils/posthogTracking";
import { AdminView } from "./views/admin/AdminView";
import { ImpersonateRedirect } from "./views/admin/ImpersonateRedirect";
import { OAuthClientsView } from "./views/admin/oauth/OAuthClientsView";
import { AcceptInvitation } from "./views/auth/AcceptInvitation";
import { PasswordSignIn } from "./views/auth/components/PasswordSignIn";
import { Consent } from "./views/auth/Consent";
import { SignIn } from "./views/auth/SignIn";
import { Otp } from "./views/cli/Otp";
import CustomersPage from "./views/customers/CustomersPage";
import { AnalyticsView } from "./views/customers/customer/analytics/AnalyticsView";
import CustomerView2 from "./views/customers2/customer/CustomerView2";
import CustomerPlanEditor from "./views/customers2/customer-plan/CustomerPlanEditor";
import { DefaultView } from "./views/DefaultView";
import DevScreen from "./views/developer/DevView";
import { CloseScreen } from "./views/general/CloseScreen";
import OnboardingView3 from "./views/onboarding3/OnboardingView3";
import QuickstartView from "./views/onboarding4/QuickstartView";
import ProductsView from "./views/products/ProductsView";
import PlanEditorView from "./views/products/plan/PlanEditorView";
import { OrgSettingsView } from "./views/settings/OrgSettingsView";
import { TerminalView } from "./views/TerminalView";

export function SquircleProvider({ children }: { children: React.ReactNode }) {
	React.useEffect(() => void init(), []);
	return children;
}

export default function App() {
	const { data } = useSession();

	useEffect(() => {
		if (data) {
			identifyUser({
				email: data.user.email,
				name: data.user.name,
			});
			Sentry.setUser({
				email: data.user.email ?? "unknown_email",
				name: data.user.name ?? "unknown_name",
				id: data.user.id ?? "unknown_user",
			});
			Sentry.setTags({
				org_id: data.session.activeOrganizationId ?? "unknown_org",
			});
		}
	}, [data]);
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/sign-in" element={<SignIn />} />
				<Route path="/pw-sign-in" element={<PasswordSignIn />} />
				<Route path="/consent" element={<Consent />} />
				<Route path="/accept" element={<AcceptInvitation />} />
				<Route path="/close" element={<CloseScreen />} />

				{/* Onboarding routes without sidebar */}
				<Route element={<OnboardingLayout />}>
					<Route path="/sandbox/onboarding" element={<OnboardingView3 />} />
					<Route path="/sandbox/quickstart" element={<QuickstartView />} />
				</Route>

				<Route element={<MainLayout />}>
					<Route path="*" element={<DefaultView />} />
					<Route path="/settings" element={<OrgSettingsView />} />
					<Route path="/admin" element={<AdminView />} />
					<Route path="/admin/oauth" element={<OAuthClientsView />} />
					<Route
						path="/impersonate-redirect"
						element={<ImpersonateRedirect />}
					/>
					<Route path="/trmnl" element={<TerminalView />} />

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
						element={
							<SquircleProvider>
								<PlanEditorView />
							</SquircleProvider>
						}
					/>
					<Route
						path="/sandbox/products/:product_id"
						element={
							<SquircleProvider>
								<PlanEditorView />
							</SquircleProvider>
						}
					/>

					<Route path="/customers" element={<CustomersPage />} />
					<Route path="/sandbox/customers" element={<CustomersPage />} />
					<Route path="/customers/:customer_id" element={<CustomerView2 />} />
					<Route
						path="/sandbox/customers/:customer_id"
						element={<CustomerView2 />}
					/>
					<Route
						path="/customers/:customer_id/:product_id"
						// element={<CustomerProductView />}
						element={<CustomerPlanEditor />}
					/>
					<Route
						path="/sandbox/customers/:customer_id/:product_id"
						// element={<CustomerProductView />}
						element={<CustomerPlanEditor />}
					/>
					<Route path="/dev" element={<DevScreen />} />
					<Route path="/sandbox/dev" element={<DevScreen />} />
					<Route path="/events" element={<AnalyticsView />} />
					<Route path="/sandbox/events" element={<AnalyticsView />} />
					<Route path="/dev/cli" element={<Otp />} />
					<Route path="/sandbox/dev/cli" element={<Otp />} />
				</Route>
			</Routes>
		</BrowserRouter>
	);
}
