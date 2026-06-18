import { AppEnv } from "@autumn/shared";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { AutumnProvider } from "autumn-js/react";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router";
import { CustomToaster } from "@/components/general/CustomToaster";
import { SandboxBanner } from "@/components/general/SandboxBanner";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { PortalContainerContext } from "@/contexts/PortalContainerContext";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useGlobalErrorHandler } from "@/hooks/common/useGlobalErrorHandler";
import { useOrg } from "@/hooks/common/useOrg";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import CommandBar from "@/views/command-bar/CommandBar";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useEventNames } from "@/views/customers/customer/analytics/hooks/useEventNames";
import { InviteNotifications } from "@/views/general/notifications/InviteNotifications";
import { DeployToProdDialog } from "@/views/main-sidebar/components/deploy-button/DeployToProdDialog";
import { MainSidebar } from "@/views/main-sidebar/MainSidebar";
import { MobileSidebar } from "@/views/main-sidebar/MobileSidebar";
import { MobileTopBar } from "@/views/main-sidebar/MobileTopBar";
import { AppContext } from "./AppContext";

export function MainLayout() {
	const { handleApiError } = useGlobalErrorHandler();
	const containerRef = useRef<HTMLDivElement>(null);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
			// backendUrl="http://localhost:8080"
			includeCredentials={true}
		>
			<NuqsAdapter>
				<PortalContainerContext.Provider value={containerRef}>
					<div className="w-screen h-screen flex bg-outer-background">
						<CustomToaster />
						<div className="hidden sm:flex">
							<MainSidebar />
						</div>
						<MobileSidebar
							open={mobileSidebarOpen}
							onOpenChange={setMobileSidebarOpen}
						/>
						<InviteNotifications />
						<MainContent
							containerRef={containerRef}
							onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
						/>
						{/* <ChatWidget /> */}
						<CommandBar />
					</div>
				</PortalContainerContext.Provider>
			</NuqsAdapter>
		</AutumnProvider>
	);
}

const MainContent = ({
	containerRef,
	onOpenMobileSidebar,
}: {
	containerRef: React.RefObject<HTMLDivElement>;
	onOpenMobileSidebar: () => void;
}) => {
	const env = useEnv();
	const { org } = useOrg();
	const [showDeployDialog, setShowDeployDialog] = useState(false);

	useDevQuery();
	useAutumnFlags();
	useFeatureFlags();
	useFeaturesQuery();
	useRewardsQuery();
	useEventNames();

	return (
		<AppContext.Provider value={{}}>
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
						<SandboxBanner>
							{!org?.deployed && (
								<IconButton
									variant="secondary"
									size="sm"
									icon={<ArrowRightIcon />}
									iconOrientation="right"
									onClick={() => setShowDeployDialog(true)}
									className="border-sandbox/50 animate-in fade-in-0 duration-300 slide-in-from-right-2"
								>
									Deploy to Production
								</IconButton>
							)}
						</SandboxBanner>
					)}
					<DeployToProdDialog
						open={showDeployDialog}
						onOpenChange={setShowDeployDialog}
					/>
					<MobileTopBar onMenuClick={onOpenMobileSidebar} />
					<div
						data-main-content
						className={cn(
							"w-full h-full overflow-auto flex justify-center bg-background relative",
						)}
					>
						<div className="w-full h-full justify-center">
							<Outlet />
						</div>
					</div>
				</div>
			</main>
		</AppContext.Provider>
	);
};
