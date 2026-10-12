import { StatusChipIcon } from "@autumn/ui";
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
	const { tile } = modification.chip;
	return (
		// Children sit in the label column; an invisible copy of the parent's icon sizes the column before it.
		<div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-1.5">
			<span
				className={cn(
					"w-2.5 shrink-0 text-center font-semibold",
					sign.className,
				)}
			>
				{sign.mark}
			</span>
			<div className="col-span-2 flex min-w-0">
				<ViewChip chip={modification.chip} />
			</div>
			{modification.children && (
				<>
					{tile && (
						<StatusChipIcon
							className="invisible col-start-2 self-start"
							glyph={tile.glyph}
							tone={tile.tone}
						/>
					)}
					<div className="col-start-3 flex flex-col items-start gap-1.5">
						{modification.children.map((child) => (
							<RateChangeChip child={child} key={child.key} />
						))}
					</div>
				</>
			)}
		</div>
	);
}
