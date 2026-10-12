import { cn } from "@/lib/utils";
import type { ModificationView } from "../rowView/operationsView";
import { RateChangeChip } from "./RateChangeChip";
import { ViewChip } from "./ViewChip";

const SIGNS: Record<
	ModificationView["sign"],
	{ mark: string; className: string }
> = {
	add: { mark: "+", className: "text-[#30A46C]" },
	change: { mark: "~", className: "text-[#E5A21F]" },
	remove: { mark: "−", className: "text-[#E5484D]" },
};

/** One operation row; its rate changes nest beneath it with no sign of their own. */
export function ModificationRow({
	modification,
}: {
	modification: ModificationView;
}) {
	const sign = SIGNS[modification.sign];
	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex items-center gap-1.5">
				<span
					className={cn(
						"w-2.5 shrink-0 text-center font-semibold",
						sign.className,
					)}
				>
					{sign.mark}
				</span>
				<ViewChip chip={modification.chip} />
			</div>
			{modification.children && (
				<div className="ml-1 flex flex-col items-start gap-1.5 border-l border-border pl-3.5">
					{modification.children.map((child) => (
						<RateChangeChip child={child} key={child.key} />
					))}
				</div>
			)}
		</div>
	);
}
