import { useNavigate } from "react-router";
import { pushPage } from "@/utils/genUtils";
import { AIChatView } from "./AIChatView";

export default function QuickstartView() {
	const navigate = useNavigate();

	const handleSkipToDashboard = () => {
		pushPage({ path: "/products", navigate });
	};

	return <AIChatView onBack={handleSkipToDashboard} />;
}
