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
import { SSO_CALLBACK_PATH } from "./lib/sso/ssoCallback";
import { identifyUser } from "./utils/posthogTracking";
import LoadingScreen from "./views/general/LoadingScreen";

const AdminView = React.lazy(() =>
	import("./views/admin/AdminView").then(({ AdminView }) => ({
		default: AdminView,
	})),
);
const EdgeConfigView = React.lazy(() =>
	import("./views/admin/edge-config/EdgeConfigView").then(
		({ EdgeConfigView }) => ({ default: EdgeConfigView }),
	),
);
const ImpersonateRedirect = React.lazy(() =>
	import("./views/admin/ImpersonateRedirect").then(
		({ ImpersonateRedirect }) => ({ default: ImpersonateRedirect }),
	),
);
const OAuthClientsView = React.lazy(() =>
	import("./views/admin/oauth/OAuthClientsView").then(
		({ OAuthClientsView }) => ({ default: OAuthClientsView }),
	),
);
const AcceptInvitation = React.lazy(() =>
	import("./views/auth/AcceptInvitation").then(({ AcceptInvitation }) => ({
		default: AcceptInvitation,
	})),
);
const Consent = React.lazy(() =>
	import("./views/auth/Consent").then(({ Consent }) => ({ default: Consent })),
);
const PasswordSignIn = React.lazy(() =>
	import("./views/auth/components/PasswordSignIn").then(
		({ PasswordSignIn }) => ({ default: PasswordSignIn }),
	),
);
const SignIn = React.lazy(() =>
	import("./views/auth/SignIn").then(({ SignIn }) => ({ default: SignIn })),
);
const SsoCallback = React.lazy(() =>
	import("./views/auth/SsoCallback").then(({ SsoCallback }) => ({
		default: SsoCallback,
	})),
);
const CustomersPage = React.lazy(
	() => import("./views/customers/CustomersPage"),
);
const AnalyticsView = React.lazy(() =>
	import("./views/customers/customer/analytics/AnalyticsView").then(
		({ AnalyticsView }) => ({ default: AnalyticsView }),
	),
);
const CustomerView2 = React.lazy(
	() => import("./views/customers2/customer/CustomerView2"),
);
const CustomerPlanEditor = React.lazy(
	() => import("./views/customers2/customer-plan/CustomerPlanEditor"),
);
const DefaultView = React.lazy(() =>
	import("./views/DefaultView").then(({ DefaultView }) => ({
		default: DefaultView,
	})),
);
const DevScreen = React.lazy(() => import("./views/developer/DevView"));
const CloseScreen = React.lazy(() =>
	import("./views/general/CloseScreen").then(({ CloseScreen }) => ({
		default: CloseScreen,
	})),
);
const MigrationsView = React.lazy(() =>
	import("./views/migrations/MigrationsView").then(({ MigrationsView }) => ({
		default: MigrationsView,
	})),
);
const MigrationView = React.lazy(() =>
	import("./views/migrations/migration/MigrationView").then(
		({ MigrationView }) => ({ default: MigrationView }),
	),
);
const OnboardingView = React.lazy(
	() => import("./views/onboarding/OnboardingView"),
);
const QuickstartView = React.lazy(
	() => import("./views/onboarding4/QuickstartView"),
);
const ProductsView = React.lazy(() => import("./views/products/ProductsView"));
const PlanEditorView = React.lazy(
	() => import("./views/products/plan/PlanEditorView"),
);
const SettingsView = React.lazy(() =>
	import("./views/settings/SettingsView").then(({ SettingsView }) => ({
		default: SettingsView,
	})),
);
const TerminalView = React.lazy(() =>
	import("./views/TerminalView").then(({ TerminalView }) => ({
		default: TerminalView,
	})),
);

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
			<React.Suspense fallback={<LoadingScreen fullPage />}>
				<Routes>
					<Route path="/sign-in" element={<SignIn />} />
					<Route path="/pw-sign-in" element={<PasswordSignIn />} />
					<Route path="/consent" element={<Consent />} />
					<Route path="/accept" element={<AcceptInvitation />} />
					<Route path={SSO_CALLBACK_PATH} element={<SsoCallback />} />
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

							{envRoutes("customers", <CustomersPage />)}
							{envRoutes("customers/:customer_id", <CustomerView2 />)}
							{envRoutes(
								"customers/:customer_id/:product_id",
								<CustomerPlanEditor />,
							)}
							{envRoutes("dev", <DevScreen />)}
							{envRoutes("analytics", <AnalyticsView />)}
							{envRoutes("onboarding", <OnboardingView />)}
						</Route>
					</Route>
				</Routes>
			</React.Suspense>
		</BrowserRouter>
	);
}
