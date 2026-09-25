import { AccordionContent, AccordionItem, AccordionTrigger } from "@autumn/ui";
import { cn } from "@/lib/utils";
import type { ReviewChangeSection } from "../../utils/review/types/reviewChange";
import { ReviewChangeRowItem } from "./ReviewChangeRowItem";

export type ReviewChangeSystem = "autumn" | "stripe";

export function ReviewChangeGroup({
	value,
	system,
	title,
	section,
}: {
	value: string;
	system: ReviewChangeSystem;
	title: string;
	section: ReviewChangeSection;
}) {
	return (
		<AccordionItem value={value} className="border-b border-border">
			<AccordionTrigger className="items-center gap-2.5 py-3 hover:no-underline">
				<span
					className={cn(
						"size-2 shrink-0 rounded-[2px]",
						system === "autumn" ? "bg-primary" : "bg-indigo-500",
					)}
				/>
				<span className="flex-1 text-sm font-medium text-foreground">
					{title}
				</span>
				<span className="text-xs font-normal text-subtle">
					{section.summary}
				</span>
			</AccordionTrigger>
			<AccordionContent className="flex flex-col gap-1.5 pb-3.5 pl-[18px]">
				{section.rows.map((row) => (
					<ReviewChangeRowItem key={row.key} row={row} />
				))}
			</AccordionContent>
		</AccordionItem>
	);
}
