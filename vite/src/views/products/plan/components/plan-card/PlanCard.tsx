import { Card, CardContent, Separator } from "@autumn/ui";
import { useHotkeys } from "react-hotkeys-hook";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeatureNavigation } from "../../hooks/useFeatureNavigation";
import { PlanCardHeader } from "./PlanCardHeader";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard() {
	useFeatureNavigation();
	const { sheetType } = useSheet();

	useHotkeys("ctrl+s", () => {
		console.log("Save");
	});

	return (
		<Card
			className="min-w-sm max-w-xl mx-4 w-full !rounded-2xl gap-2 bg-background outline-4 outline-outer-background z-50 relative"
			onMouseDown={(e) => e.stopPropagation()}
		>
			{sheetType && (
				<div className="bg-white/50 dark:bg-black/50 absolute pointer-events-none rounded-2xl -inset-[5px]" />
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
