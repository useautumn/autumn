import { useHotkeys } from "react-hotkeys-hook";
import { Card, CardContent } from "@/components/v2/cards/Card";
import { Separator } from "@/components/v2/separator";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useFeatureNavigation } from "../../hooks/useFeatureNavigation";
import { PlanCardHeader } from "./PlanCardHeader";
import { PlanFeatureList } from "./PlanFeatureList";

export default function sPlanCard() {
	// Initialize feature navigation (registers hotkeys internally)
	useFeatureNavigation();
	const sheetType = useSheetStore((s) => s.type);

	useHotkeys("ctrl+s", () => {
		console.log("Save");
	});

	return (
		<Card
			className="min-w-sm max-w-xl mx-4 w-full !rounded-2xl gap-2 bg-background outline-4 outline-outer-background z-50 relative"
			onMouseDown={(e) => e.stopPropagation()}
		>
			{/* Overlay when sheet is open that lets you hover on plan card buttons */}
			{sheetType && (
				<div className="bg-background/40 absolute pointer-events-none rounded-2xl -inset-[1px]"></div>
			)}
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
