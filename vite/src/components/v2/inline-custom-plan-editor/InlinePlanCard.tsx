import { Card, CardContent } from "@/components/v2/cards/card";
import { Separator } from "@/components/v2/separator";
import { useInlineEditorContext } from "./InlineEditorContext";
import { InlinePlanCardHeader } from "./InlinePlanCardHeader";
import { InlinePlanFeatureList } from "./InlinePlanFeatureList";

export function InlinePlanCard() {
	const { sheetType } = useInlineEditorContext();

	return (
		<Card
			className="min-w-sm max-w-xl mx-4 w-full rounded-2xl! gap-2 bg-background outline-4 outline-outer-background z-50 relative"
			onMouseDown={(e) => e.stopPropagation()}
		>
			{sheetType && (
				<div className="bg-white/50 dark:bg-black/50 absolute pointer-events-none rounded-2xl -inset-[5px]" />
			)}
			<InlinePlanCardHeader />

			<div className="px-4">
				<Separator />
			</div>

			<CardContent className="max-w-full">
				<InlinePlanFeatureList />
			</CardContent>
		</Card>
	);
}
