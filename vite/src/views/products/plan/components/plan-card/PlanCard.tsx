import { useHotkeys } from "react-hotkeys-hook";
import { Card, CardContent } from "@/components/v2/cards/Card";
import { Separator } from "@/components/v2/separator";
import { useFeatureNavigation } from "../../hooks/useFeatureNavigation";
import { PlanCardHeader } from "./PlanCardHeader";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard() {
	// Initialize feature navigation (registers hotkeys internally)
	useFeatureNavigation();

	useHotkeys("ctrl+s", () => {
		console.log("Save");
	});

	return (
		<Card className={`min-w-sm max-w-xl mx-4 bg-card w-[80%]`}>
			<PlanCardHeader />

			<div className="px-4">
				<Separator />
			</div>

			<CardContent className="max-w-full">
				<PlanFeatureList />
			</CardContent>
		</Card>
	);
}
