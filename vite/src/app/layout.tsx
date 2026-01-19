import { AppEnv } from "@autumn/shared";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { AutumnProvider } from "autumn-js/react";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { CustomToaster } from "@/components/general/CustomToaster";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { PortalContainerContext } from "@/contexts/PortalContainerContext";
import { useAutumnFlags } from "@/hooks/common/useAutumnFlags";
import { useGlobalErrorHandler } from "@/hooks/common/useGlobalErrorHandler";
import { useOrg } from "@/hooks/common/useOrg";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import CommandBar from "@/views/command-bar/CommandBar";
import { useCusSearchQuery } from "@/views/customers/hooks/useCusSearchQuery";
import LoadingScreen from "@/views/general/LoadingScreen";
import { InviteNotifications } from "@/views/general/notifications/InviteNotifications";
import { DeployToProdDialog } from "@/views/main-sidebar/components/deploy-button/DeployToProdDialog";
import { MainSidebar } from "@/views/main-sidebar/MainSidebar";
import { AppContext } from "./AppContext";

export function MainLayout() {
	const env = useEnv();
	const { data, isPending } = useSession();
	const { org, isLoading: orgLoading } = useOrg();
	const { handleApiError } = useGlobalErrorHandler();
	const containerRef = useRef<HTMLDivElement>(null);

	const navigate = useNavigate();

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

	// Redirect to sandbox if not deployed
	useEffect(() => {
		if (!orgLoading && org && !org.deployed) {
			const pathname = window.location.pathname;
			if (!pathname.startsWith("/sandbox")) {
				const search = window.location.search;
				navigate(`/sandbox${pathname}${search}`);
			}
		}
	}, [org, orgLoading, navigate]);

	// 1. If not loaded, show loading screen
	if (isPending || orgLoading) {
		return (
			<AutumnProvider
				backendUrl={import.meta.env.VITE_BACKEND_URL}
				includeCredentials={true}
			>
				<div className="w-screen h-screen flex bg-outer-background">
					<MainSidebar />
					<div className="w-full h-screen flex flex-col overflow-hidden py-3 pr-3">
						<div className="w-full h-full flex flex-col overflow-hidden rounded-lg border">
							{env === AppEnv.Sandbox && (
								<div className="w-full min-h-10 h-10 bg-t8/10 border-t8/20 border-b text-white text-sm flex items-center justify-center relative px-4">
									<p className="font-medium text-t8 font-mono">
										You&apos;re in sandbox
									</p>
								</div>
							)}
							<div className="flex bg-background flex-col h-full">
								<LoadingScreen />
							</div>
						</div>
					</div>
				</div>
			</AutumnProvider>
		);
	}

	// 2. If no user, redirect to sign in
	if (!data) {
		navigate("/sign-in");
		return;
	}

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
						<MainSidebar />
						<InviteNotifications />
						<MainContent containerRef={containerRef} />
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
}: {
	containerRef: React.RefObject<HTMLDivElement>;
}) => {
	const env = useEnv();
	const { org } = useOrg();
	const [showDeployDialog, setShowDeployDialog] = useState(false);

	useDevQuery();
	useAutumnFlags();
	useFeaturesQuery();
	useRewardsQuery();
	useCusSearchQuery();

	return (
		<AppContext.Provider value={{}}>
			<main
				className={cn(
					"w-full h-screen flex flex-col justify-center overflow-hidden py-3 pr-3 relative",
					// Default font
					"font-normal",
				)}
			>
				<div
					ref={containerRef}
					className="w-full h-full flex flex-col overflow-hidden rounded-xl border relative"
				>
					{env === AppEnv.Sandbox && (
						<div className="w-full min-h-10 h-10 bg-t8/10 text-sm flex items-center justify-center relative px-4 text-t8 border-b border-t8/20">
							<p className="font-medium font-mono">You&apos;re in sandbox</p>
							{!org?.deployed && (
								<IconButton
									variant="secondary"
									size="sm"
									icon={<ArrowRightIcon />}
									iconOrientation="right"
									onClick={() => setShowDeployDialog(true)}
									className="absolute right-3 border-t8/50 animate-in fade-in-0 duration-300 slide-in-from-right-2"
								>
									Deploy to Production
								</IconButton>
							)}
						</div>
					)}
					<DeployToProdDialog
						open={showDeployDialog}
						onOpenChange={setShowDeployDialog}
					/>
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
