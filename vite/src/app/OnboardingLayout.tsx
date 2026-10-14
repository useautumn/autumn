import { AutumnProvider } from "autumn-js/react";
import { NuqsAdapter } from "nuqs/adapters/react-router/v7";
import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { CustomToaster } from "@/components/general/CustomToaster";
import { useGlobalErrorHandler } from "@/hooks/common/useGlobalErrorHandler";
import { useSession } from "@/lib/auth-client";
import LoadingScreen from "@/views/general/LoadingScreen";

export function OnboardingLayout() {
	const { data, isPending } = useSession();
	const { handleApiError } = useGlobalErrorHandler();
	const navigate = useNavigate();

	useEffect(() => {
		const handleGlobalError = (event: ErrorEvent) => {
			if (event.error?.response) {
				handleApiError(event.error);
			}
		};

		window.addEventListener("error", handleGlobalError);
		return () => window.removeEventListener("error", handleGlobalError);
	}, [handleApiError]);

	if (isPending) {
		return (
			<AutumnProvider
				backendUrl={`${import.meta.env.VITE_BACKEND_URL}/demo`.replace(
					/([^:]\/)\/+/g,
					"$1",
				)}
				includeCredentials={true}
			>
				<div className="w-screen h-screen flex items-center justify-center bg-background">
					<LoadingScreen />
				</div>
			</AutumnProvider>
		);
	}

	if (!data) {
		navigate("/sign-in");
		return;
	}

	return (
		<AutumnProvider
			backendUrl={`${import.meta.env.VITE_BACKEND_URL}/demo`.replace(
				/([^:]\/)\/+/g,
				"$1",
			)}
			includeCredentials={true}
		>
			<NuqsAdapter>
				<main className="w-screen h-screen bg-background">
					<CustomToaster />
					<Outlet />
				</main>
			</NuqsAdapter>
		</AutumnProvider>
	);
}
