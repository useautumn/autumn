import { AppEnv } from "@autumn/shared";
import { SandboxBanner, SandboxBannerAction } from "@autumn/ui";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { AutumnProvider } from "autumn-js/react";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { CustomToaster } from "@/components/general/CustomToaster";
import { SandboxFavicon } from "@/components/general/SandboxFavicon";
import { PhosphorIcon } from "@/components/v2/icons/PhosphorIcon";
import { PortalContainerContext } from "@/contexts/PortalContainerContext";
import { useActiveOrgId } from "@/hooks/common/useActiveOrgId";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useFontsReady } from "@/hooks/common/useFontsReady";
import { useGlobalErrorHandler } from "@/hooks/common/useGlobalErrorHandler";
import { useOrg } from "@/hooks/common/useOrg";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { sandboxColorValue } from "@/hooks/sandbox/sandboxDisplay";
import {
	setActiveSandbox,
	useActiveSandbox,
} from "@/hooks/sandbox/useActiveSandbox";
import { useSyncSandboxFromUrl } from "@/hooks/sandbox/useSyncSandboxFromUrl";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { LeafPanel } from "@/views/chat/LeafPanel";
import { CustomersListPrefetch } from "@/views/customers/CustomersListPrefetch";
import { useEventNames } from "@/views/customers/customer/analytics/hooks/useEventNames";
import { CustomerFiltersProvider } from "@/views/customers/hooks/useCustomerFilters";
import LoadingScreen from "@/views/general/LoadingScreen";
import { InviteNotifications } from "@/views/general/notifications/InviteNotifications";
import { useEnvChange } from "@/views/main-sidebar/EnvDropdown";
import { MainSidebar } from "@/views/main-sidebar/MainSidebar";
import { MobileSidebar } from "@/views/main-sidebar/MobileSidebar";
import { MobileTopBar } from "@/views/main-sidebar/MobileTopBar";
import { SettingsViewSkeleton } from "@/views/settings/SettingsView";
import { AppContext } from "./AppContext";
import { usePrefetchCurrentRoute } from "./usePrefetchCurrentRoute";

// Closed until the user asks for them, so they load beside the page instead of in the entry.
const CommandBar = lazy(() => import("@/views/command-bar/CommandBar"));
const DeployToProdDialog = lazy(() =>
	import(
		"@/views/main-sidebar/components/deploy-button/DeployToProdDialog"
	).then((module) => ({ default: module.DeployToProdDialog })),
);

export function MainLayout() {
	const { handleApiError } = useGlobalErrorHandler();
	const containerRef = useRef<HTMLDivElement>(null);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const queryClient = useQueryClient();
	// Mounted (so data keeps loading) but hidden until fonts land, so the first paint doesn't shift.
	const fontsReady = useFontsReady();

	// Global error handler for API errors
	useEffect(() => {
		const handleGlobalError = (event: ErrorEvent) => {
			if (event.error?.response) {
				handleApiError(event.error);
			}
		};

		window.addEventListener("error", handleGlobalError);
		return () => window.removeEventListener("error", handleGlobalError);
	}, [handleApiError]);

	return (
		<AutumnProvider
			backendUrl={import.meta.env.VITE_BACKEND_URL}
			includeCredentials={true}
		>
			{/* AutumnProvider brings its own client; re-provide the app's persisted one so the
			dashboard and DashboardGate share one cache. */}
			<QueryClientProvider client={queryClient}>
				<NuqsAdapter>
					<PortalContainerContext.Provider value={containerRef}>
						<div
							className={cn(
								"w-screen h-screen flex bg-outer-background",
								!fontsReady && "invisible",
							)}
						>
							<CustomToaster />
							<DashboardShell
								containerRef={containerRef}
								mobileSidebarOpen={mobileSidebarOpen}
								onMobileSidebarOpenChange={setMobileSidebarOpen}
							/>
						</div>
					</PortalContainerContext.Provider>
				</NuqsAdapter>
			</QueryClientProvider>
		</AutumnProvider>
	);
}

const DashboardShell = ({
	containerRef,
	mobileSidebarOpen,
	onMobileSidebarOpenChange,
}: {
	containerRef: React.RefObject<HTMLDivElement>;
	mobileSidebarOpen: boolean;
	onMobileSidebarOpenChange: (open: boolean) => void;
}) => {
	const { sandboxUrlResolved } = useSyncSandboxFromUrl();
	// Scoped query keys carry the org id, so hold the shell until one is known;
	// otherwise every early query refetches once it arrives.
	const { activeOrgId, sessionPending } = useActiveOrgId();

	if (!sandboxUrlResolved || (sessionPending && !activeOrgId)) {
		return <LoadingScreen fullPage />;
	}

	return (
		<>
			<SandboxFavicon />
			<div className="hidden sm:flex">
				<MainSidebar />
			</div>
			<MobileSidebar
				open={mobileSidebarOpen}
				onOpenChange={onMobileSidebarOpenChange}
			/>
			<InviteNotifications />
			<MainContent
				containerRef={containerRef}
				onOpenMobileSidebar={() => onMobileSidebarOpenChange(true)}
			/>
			<Suspense fallback={null}>
				<CommandBar />
			</Suspense>
			<LeafPanel />
		</>
	);
};

/** Settings draws its own layout while the org loads, so a reload settles in place instead of flashing a spinner. */
const ContentLoading = () => {
	const { pathname } = useLocation();
	if (pathname.endsWith("/settings")) return <SettingsViewSkeleton />;
	return <LoadingScreen />;
};

const MainContent = ({
	containerRef,
	onOpenMobileSidebar,
}: {
	containerRef: React.RefObject<HTMLDivElement>;
	onOpenMobileSidebar: () => void;
}) => {
	const env = useEnv();
	const activeSandbox = useActiveSandbox();
	const { org, isLoading: orgLoading } = useOrg();
	const [showDeployDialog, setShowDeployDialog] = useState(false);
	const handleEnvChange = useEnvChange();
	const isCapyDev = import.meta.env.VITE_CAPY_DEV === "1";

	useDevQuery();
	useAutumnFlags();
	useFeatureFlags();
	useFeaturesQuery();
	useRewardsQuery();
	useEventNames({ enabled: !isCapyDev });
	const { isCustomersList, routeChunkReady } = usePrefetchCurrentRoute();

	const showLoading = orgLoading || !org || !routeChunkReady;

	const switchToProduction = () => {
		setActiveSandbox(null);
		handleEnvChange(AppEnv.Live);
	};

	return (
		<AppContext.Provider value={{}}>
			{isCustomersList && (
				<CustomerFiltersProvider>
					<CustomersListPrefetch />
				</CustomerFiltersProvider>
			)}
			<main
				className={cn(
					"w-full h-screen flex flex-col justify-center overflow-hidden sm:py-3 sm:pr-3 relative",
					// Default font
					"font-normal",
				)}
			>
				<div
					ref={containerRef}
					className="w-full h-full flex flex-col overflow-hidden sm:rounded-xl sm:border relative"
				>
					{env === AppEnv.Sandbox && (
						<SandboxBanner
							label={activeSandbox?.name}
							icon={
								activeSandbox?.icon ? (
									<PhosphorIcon name={activeSandbox.icon} className="size-3" />
								) : undefined
							}
							color={
								activeSandbox
									? sandboxColorValue(activeSandbox.color)
									: undefined
							}
							className={
								activeSandbox?.color === "amber" ? "text-black" : undefined
							}
						>
							{org?.deployed ? (
								<SandboxBannerAction onClick={switchToProduction}>
									Production
								</SandboxBannerAction>
							) : (
								<SandboxBannerAction onClick={() => setShowDeployDialog(true)}>
									Deploy to production
								</SandboxBannerAction>
							)}
						</SandboxBanner>
					)}
					<Suspense fallback={null}>
						<DeployToProdDialog
							open={showDeployDialog}
							onOpenChange={setShowDeployDialog}
						/>
					</Suspense>
					<MobileTopBar onMenuClick={onOpenMobileSidebar} />
					<div
						data-main-content
						className={cn(
							"w-full h-full overflow-auto flex justify-center bg-background relative",
						)}
					>
						{/* min-h-full, not h-full: content taller than the viewport (zoomed
						    in, or a long page) must extend the scroll area rather than be
						    clipped inside a fixed-height child. */}
						<div className="w-full min-h-full justify-center">
							{showLoading ? (
								<ContentLoading />
							) : (
								<Suspense fallback={<LoadingScreen />}>
									<Outlet />
								</Suspense>
							)}
						</div>
					</div>
				</div>
			</main>
		</AppContext.Provider>
	);
};
