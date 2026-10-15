import { AppEnv } from "@autumn/shared";
import { init } from "@squircle/core";
import * as React from "react";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { setErrorReportingUser } from "@/lib/errorReporting";
import { DashboardGate } from "./app/DashboardGate";
import { MainLayout } from "./app/layout";
import { OnboardingLayout } from "./app/OnboardingLayout";
import {
	CustomersListRoute,
	CustomerViewRoute,
	PlanEditorRoute,
	ProductsListRoute,
} from "./app/routeChunks";
import { useSession } from "./lib/auth-client";
import { queryPersistOptions } from "./lib/queryPersistence";
import { SSO_CALLBACK_PATH } from "./lib/sso/ssoCallback";
import { identifyUser } from "./utils/posthogTracking";
import LoadingScreen from "./views/general/LoadingScreen";
// Eager: the command bar already bundles it, so lazy only added a fallback frame on load.
import { SettingsView } from "./views/settings/SettingsView";

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
const ShadowAtomView = React.lazy(() =>
	import("./views/admin/shadow-atom/ShadowAtomView").then(
		({ ShadowAtomView }) => ({ default: ShadowAtomView }),
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
const ClaimOrg = React.lazy(() =>
	import("./views/auth/ClaimOrg").then(({ ClaimOrg }) => ({
		default: ClaimOrg,
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
const AnalyticsView = React.lazy(() =>
	import("./views/customers/customer/analytics/AnalyticsView").then(
		({ AnalyticsView }) => ({ default: AnalyticsView }),
	),
);
const LogsView = React.lazy(() =>
	import("./views/event-logs/LogsView").then(({ LogsView }) => ({
		default: LogsView,
	})),
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
const MigrationListPreview = React.lazy(() =>
	import("./views/migrations/migration-list/preview/MigrationListPreview").then(
		({ MigrationListPreview }) => ({ default: MigrationListPreview }),
	),
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
	const { data, isPending } = useSession();

	useEffect(() => {
		if (!isPending && !data) void queryPersistOptions.persister.removeClient();
	}, [isPending, data]);

	useEffect(() => {
		if (data?.user) {
			identifyUser({
				email: data.user.email,
				name: data.user.name,
			});
			setErrorReportingUser({
				user: data.user,
				orgId: data.session.activeOrganizationId,
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
					<Route path="/claim" element={<ClaimOrg />} />
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
							{envRoutes("admin/shadow-atom", <ShadowAtomView />)}
							{envRoutes("impersonate-redirect", <ImpersonateRedirect />)}
							<Route path="/trmnl" element={<TerminalView />} />

							{envRoutes(
								"products",
								<ProductsListRoute env={AppEnv.Live} />,
								<ProductsListRoute env={AppEnv.Sandbox} />,
							)}
							{envRoutes("migrations", <MigrationsView />)}
							{envRoutes("migrations/:migration_id", <MigrationView />)}
							{import.meta.env.DEV &&
								envRoutes("dev/migrations", <MigrationListPreview />)}
							{envRoutes(
								"products/:product_id",
								<SquircleProvider>
									<PlanEditorRoute />
								</SquircleProvider>,
							)}

							{envRoutes("customers", <CustomersListRoute />)}
							{envRoutes("customers/:customer_id", <CustomerViewRoute />)}
							{envRoutes(
								"customers/:customer_id/:product_id",
								<CustomerPlanEditor />,
							)}
							{envRoutes("dev", <DevScreen />)}
							{envRoutes("analytics", <AnalyticsView />)}
							{envRoutes("logs", <LogsView />)}
							{envRoutes("onboarding", <OnboardingView />)}
						</Route>
					</Route>
				</Routes>
			</React.Suspense>
		</BrowserRouter>
	);
}
