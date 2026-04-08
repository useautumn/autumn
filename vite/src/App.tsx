import * as Sentry from "@sentry/react";
import { init } from "@squircle/core";
import * as React from "react";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useParams } from "react-router";
import { MainLayout } from "./app/layout";
import { OnboardingLayout } from "./app/OnboardingLayout";
import { OrgEnvGuard, RootRedirect } from "./hooks/common/useOrgEnv";

// Wrapper to force remount when org_id changes
function OrgEnvGuardWrapper() {
	const { org_id } = useParams<{ org_id: string }>();
	return <OrgEnvGuard key={org_id} />;
}
import { useSession } from "./lib/auth-client";
import { identifyUser } from "./utils/posthogTracking";
import { AdminView } from "./views/admin/AdminView";
import { ImpersonateRedirect } from "./views/admin/ImpersonateRedirect";
import { OAuthClientsView } from "./views/admin/oauth/OAuthClientsView";
import { AcceptInvitation } from "./views/auth/AcceptInvitation";
import { Consent } from "./views/auth/Consent";
import { PasswordSignIn } from "./views/auth/components/PasswordSignIn";
import { SignIn } from "./views/auth/SignIn";
import { Otp } from "./views/cli/Otp";
import CustomersPage from "./views/customers/CustomersPage";
import { AnalyticsView } from "./views/customers/customer/analytics/AnalyticsView";
import CustomerView2 from "./views/customers2/customer/CustomerView2";
import CustomerPlanEditor from "./views/customers2/customer-plan/CustomerPlanEditor";
import { DefaultView } from "./views/DefaultView";
import DevScreen from "./views/developer/DevView";
import { CloseScreen } from "./views/general/CloseScreen";
import QuickstartView from "./views/onboarding4/QuickstartView";
import ProductsView from "./views/products/ProductsView";
import PlanEditorView from "./views/products/plan/PlanEditorView";
import { OrgSettingsView } from "./views/settings/OrgSettingsView";
import { TerminalView } from "./views/TerminalView";

function SquircleProvider({ children }: { children: React.ReactNode }) {
	React.useEffect(() => void init(), []);
	return children;
}

export default function App() {
	const { data } = useSession();

	useEffect(() => {
		if (data?.user) {
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
				{/* Auth routes — excluded from org/env system */}
				<Route path="/sign-in" element={<SignIn />} />
				<Route path="/pw-sign-in" element={<PasswordSignIn />} />
				<Route path="/consent" element={<Consent />} />
				<Route path="/accept" element={<AcceptInvitation />} />
				<Route path="/close" element={<CloseScreen />} />
				<Route
					path="/impersonate-redirect"
					element={<ImpersonateRedirect />}
				/>

				{/* Root redirect */}
				<Route path="/" element={<RootRedirect />} />

				{/* Org-scoped routes */}
				<Route path="/:org_id/:env" element={<OrgEnvGuardWrapper />}>
					{/* Onboarding (separate layout) */}
					<Route element={<OnboardingLayout />}>
						<Route path="quickstart" element={<QuickstartView />} />
					</Route>

					{/* Main layout */}
					<Route element={<MainLayout />}>
						<Route path="*" element={<DefaultView />} />
						<Route path="settings" element={<OrgSettingsView />} />
						<Route path="admin" element={<AdminView />} />
						<Route path="admin/oauth" element={<OAuthClientsView />} />
						<Route path="trmnl" element={<TerminalView />} />
						<Route path="products" element={<ProductsView />} />
						<Route
							path="products/:product_id"
							element={
								<SquircleProvider>
									<PlanEditorView />
								</SquircleProvider>
							}
						/>
						<Route path="customers" element={<CustomersPage />} />
						<Route path="customers/:customer_id" element={<CustomerView2 />} />
						<Route
							path="customers/:customer_id/:product_id"
							element={<CustomerPlanEditor />}
						/>
						<Route path="dev" element={<DevScreen />} />
						<Route path="dev/cli" element={<Otp />} />
						<Route path="analytics" element={<AnalyticsView />} />
					</Route>
				</Route>

				{/* Catch-all — redirect unknown paths to root */}
				<Route path="*" element={<RootRedirect />} />
			</Routes>
		</BrowserRouter>
	);
}
