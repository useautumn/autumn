import { useNavigate } from "react-router";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { pushPage } from "@/utils/genUtils";
import { AIChatView } from "./AIChatView";

export default function QuickstartView() {
	const navigate = useNavigate();
	const { org, mutate: mutateOrg } = useOrg();
	const axiosInstance = useAxiosInstance();

	const handleSkipToDashboard = () => {
		if (!org?.onboarded) {
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
