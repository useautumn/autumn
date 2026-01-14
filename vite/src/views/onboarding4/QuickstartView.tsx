import { AppEnv } from "@autumn/shared";
import { useNavigate } from "react-router";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getEnvFromPath } from "@/utils/genUtils";
import { AIChatView } from "./AIChatView";

export default function QuickstartView() {
	const navigate = useNavigate();
	const { org, mutate: mutateOrg } = useOrg();
	const axiosInstance = useAxiosInstance();

	const handleSkipToDashboard = () => {
		if (!org?.onboarded) {
			// Fire and forget - persist to server
			axiosInstance
				.patch("/v1/organization", { onboarded: true })
				.then(() => mutateOrg())
				.catch(console.error);
		}

		// Navigate with state flag to prevent redirect back to onboarding
		const curEnv = getEnvFromPath(window.location.pathname);
		const path = curEnv === AppEnv.Sandbox ? "/sandbox/products" : "/products";
		navigate(path, { state: { skipOnboardingRedirect: true } });
	};

	return <AIChatView onBack={handleSkipToDashboard} />;
}
