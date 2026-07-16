import { Card, CardContent, Separator } from "@autumn/ui";
import type { ReactNode } from "react";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { cn } from "@/lib/utils";
import { useFeatureNavigation } from "../../hooks/useFeatureNavigation";
import { usePastePlanItem } from "../../hooks/usePastePlanItem";
import { PlanCardHeader } from "./PlanCardHeader";
import { PlanFeatureList } from "./PlanFeatureList";

export default function PlanCard({
	header,
	slim = false,
}: {
	header?: ReactNode;
	slim?: boolean;
}) {
	useFeatureNavigation();
	usePastePlanItem();
	const { sheetType } = useSheet();

	return (
		<Card
			className={cn(
				"min-w-sm max-w-xl mx-4 w-full !rounded-2xl gap-2 bg-background outline-4 outline-outer-background z-50 relative",
				slim && "!rounded-xl gap-1.5 mx-0 py-3",
			)}
			onMouseDown={(e) => e.stopPropagation()}
		>
			{sheetType && (
				<div className="bg-white/50 dark:bg-black/50 absolute pointer-events-none rounded-2xl -inset-[5px] z-10" />
			)}
			{header ?? <PlanCardHeader />}

			<div className={cn("px-4", slim && "px-3")}>
				<Separator />
			</div>

			<CardContent className={cn("max-w-full", slim && "px-3")}>
				<PlanFeatureList />
			</CardContent>
		</Card>
	);
}
