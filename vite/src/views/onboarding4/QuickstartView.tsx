import type { FrontendOrg } from "@autumn/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { pushPage } from "@/utils/genUtils";
import { AIChatView } from "./AIChatView";

export default function QuickstartView() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { org, mutate: mutateOrg } = useOrg();
	const axiosInstance = useAxiosInstance();

	const handleSkipToDashboard = () => {
		if (!org?.onboarded) {
			// Optimistically update the cache so layout.tsx won't redirect back
			queryClient.setQueryData(
				["org"],
				(old: FrontendOrg | undefined) =>
					old ? { ...old, onboarded: true } : old,
			);

			// Fire and forget - navigate immediately without waiting
			axiosInstance
				.patch("/v1/organization", { onboarded: true })
				.then(() => mutateOrg())
				.catch(console.error);
		}
		pushPage({ path: "/products", navigate });
	};

	return <AIChatView onBack={handleSkipToDashboard} />;
}
