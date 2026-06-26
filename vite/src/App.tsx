import { AppEnv } from "@autumn/shared";
import * as Sentry from "@sentry/react";
import { init } from "@squircle/core";
import * as React from "react";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { DashboardGate } from "./app/DashboardGate";
import { MainLayout } from "./app/layout";
import { OnboardingLayout } from "./app/OnboardingLayout";
import { useSession } from "./lib/auth-client";
import { identifyUser } from "./utils/posthogTracking";
import { AdminView } from "./views/admin/AdminView";
import { EdgeConfigView } from "./views/admin/edge-config/EdgeConfigView";
import { ImpersonateRedirect } from "./views/admin/ImpersonateRedirect";
import { OAuthClientsView } from "./views/admin/oauth/OAuthClientsView";
import { AcceptInvitation } from "./views/auth/AcceptInvitation";
import { Consent } from "./views/auth/Consent";
import { PasswordSignIn } from "./views/auth/components/PasswordSignIn";
import { SignIn } from "./views/auth/SignIn";
import ChatView from "./views/chat/ChatView";
import { Otp } from "./views/cli/Otp";
import CustomersPage from "./views/customers/CustomersPage";
import { AnalyticsView } from "./views/customers/customer/analytics/AnalyticsView";
import CustomerView2 from "./views/customers2/customer/CustomerView2";
import CustomerPlanEditor from "./views/customers2/customer-plan/CustomerPlanEditor";
import { DefaultView } from "./views/DefaultView";
import DevScreen from "./views/developer/DevView";
import { CloseScreen } from "./views/general/CloseScreen";
import { MigrationsView } from "./views/migrations/MigrationsView";
import { MigrationView } from "./views/migrations/migration/MigrationView";
import QuickstartView from "./views/onboarding4/QuickstartView";
import ProductsView from "./views/products/ProductsView";
import PlanEditorView from "./views/products/plan/PlanEditorView";
import { SettingsView } from "./views/settings/SettingsView";
import { TerminalView } from "./views/TerminalView";

function SquircleProvider({ children }: { children: React.ReactNode }) {
	React.useEffect(() => void init(), []);
	return children;
}

const envRoutes = (
	path: string,
	element: React.ReactNode,
	sandboxElement = element,
) => [
	<Route key={path} path={`/${path}`} element={element} />,
	<Route
		key={`sandbox-${path}`}
		path={`/sandbox/${path}`}
		element={sandboxElement}
	/>,
	<Route
		key={`sandbox-named-${path}`}
		path={`/sandbox/:sandboxSlug/${path}`}
		element={sandboxElement}
	/>,
];

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

			const isLocal = window.location.hostname === "localhost";
			const extras = isLocal ? "" : "; domain=.useautumn.com; Secure";
			if (data?.user) {
				document.cookie = `logged_in_hint=1; path=/; max-age=604800; SameSite=Lax${extras}`;
			} else {
				document.cookie = `logged_in_hint=; path=/; max-age=0; SameSite=Lax${extras}`;
			}
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

				<Route
					path="/sandbox/:sandboxSlug"
					element={<Navigate replace to="products" />}
				/>

				{/* Onboarding routes without sidebar */}
				<Route element={<OnboardingLayout />}>
					<Route path="/sandbox/quickstart" element={<QuickstartView />} />
				</Route>

				<Route element={<DashboardGate />}>
					<Route element={<MainLayout />}>
						<Route path="*" element={<DefaultView />} />
						{envRoutes("settings", <SettingsView />)}
						{envRoutes("admin", <AdminView />)}
						{envRoutes("admin/oauth", <OAuthClientsView />)}
						{envRoutes("admin/edge-config", <EdgeConfigView />)}
						{envRoutes("impersonate-redirect", <ImpersonateRedirect />)}
						<Route path="/trmnl" element={<TerminalView />} />

						{envRoutes(
							"products",
							<ProductsView env={AppEnv.Live} />,
							<ProductsView env={AppEnv.Sandbox} />,
						)}
						{envRoutes("migrations", <MigrationsView />)}
						{envRoutes("migrations/:migration_id", <MigrationView />)}
						{envRoutes(
							"products/:product_id",
							<SquircleProvider>
								<PlanEditorView />
							</SquircleProvider>,
						)}

						{envRoutes("chat", <ChatView />)}
						{envRoutes("chat/:threadId", <ChatView />)}
						{envRoutes("customers", <CustomersPage />)}
						{envRoutes("customers/:customer_id", <CustomerView2 />)}
						{envRoutes(
							"customers/:customer_id/:product_id",
							<CustomerPlanEditor />,
						)}
						{envRoutes("dev", <DevScreen />)}
						{envRoutes("analytics", <AnalyticsView />)}
						{envRoutes("dev/cli", <Otp />)}
					</Route>
				</Route>
			</Routes>
		</BrowserRouter>
	);
}
