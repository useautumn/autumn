import type { ProductV2 } from "@autumn/shared";
import { CaretRightIcon, GitPullRequestIcon } from "@phosphor-icons/react";
import type { Row } from "@tanstack/react-table";
import { AdminHover } from "@/components/general/AdminHover";
import { PlanTypeBadges } from "@/components/v2/badges/PlanTypeBadges";
import { cn } from "@/lib/utils";
import { getPlanHoverTexts } from "@/views/admin/adminUtils";

function ExpandToggle({ row }: { row: Row<ProductV2> }) {
	return (
		<button
			type="button"
			aria-label={row.getIsExpanded() ? "Collapse variants" : "Expand variants"}
			onMouseDown={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				row.toggleExpanded();
			}}
			className="-m-1 flex size-6 shrink-0 cursor-pointer items-center justify-center text-tertiary-foreground transition-colors hover:text-foreground"
		>
			<CaretRightIcon
				size={12}
				className={cn(
					"transition-transform duration-150",
					row.getIsExpanded() && "rotate-90",
				)}
			/>
		</button>
	);
}

function LeadSlot({ row }: { row: Row<ProductV2> }) {
	if (row.depth > 0) {
		return (
			<GitPullRequestIcon
				size={13}
				weight="bold"
				className="shrink-0 text-tertiary-foreground"
				aria-hidden
			/>
		);
	}
	if (row.getCanExpand()) return <ExpandToggle row={row} />;
	return null;
}

export function ProductNameCell({ row }: { row: Row<ProductV2> }) {
	const isVariant = row.depth > 0;

	return (
		<div
			className={cn(
				"flex h-full items-center gap-1.5 font-medium text-foreground",
				isVariant && "pl-[22px] font-normal text-muted-foreground",
			)}
		>
			<LeadSlot row={row} />
			<AdminHover
				texts={getPlanHoverTexts({ plan: row.original })}
				side="right"
			>
				{row.original.name}
			</AdminHover>
			<PlanTypeBadges
				product={row.original}
				iconOnly
				className="bg-transparent"
			/>
		</div>
	);
}
