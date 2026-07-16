import { Card, CardContent, Separator } from "@autumn/ui";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeatureNavigation } from "../../hooks/useFeatureNavigation";
import { usePastePlanItem } from "../../hooks/usePastePlanItem";
import { PlanCardHeader } from "./PlanCardHeader";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard() {
	useFeatureNavigation();
	usePastePlanItem();
	const { sheetType } = useSheet();

	return (
		<Card
			className="min-w-sm max-w-xl mx-4 w-full !rounded-2xl gap-2 bg-background outline-4 outline-outer-background z-50 relative"
			onMouseDown={(e) => e.stopPropagation()}
		>
			{sheetType && (
				<div className="bg-white/50 dark:bg-black/50 absolute pointer-events-none rounded-2xl -inset-[5px] z-10" />
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
