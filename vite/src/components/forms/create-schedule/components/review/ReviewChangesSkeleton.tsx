import { Skeleton } from "@autumn/ui";
import { ChevronDownIcon } from "lucide-react";
import {
	TABLE_TRAY_CLASS,
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_ROW_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";
import { ReviewGroupTitle } from "./ReviewGroupTitle";
import type { ReviewChangeSystem } from "./ReviewSystemMark";

const SKELETON_TITLE_WIDTHS = ["w-36", "w-28", "w-40"];

const COLLAPSED_GROUPS: { system: ReviewChangeSystem; title: string }[] = [
	{ system: "autumn", title: "Balances" },
	{ system: "stripe", title: "Subscription" },
];

function SkeletonGroupHeader({
	system,
	title,
	isOpen,
}: {
	system: ReviewChangeSystem;
	title: string;
	isOpen: boolean;
}) {
	return (
		<div className="flex h-[42px] items-center gap-[9px]">
			<ReviewGroupTitle system={system} title={title} />
			<span className="flex-1" />
			<Skeleton className="h-3 w-24" />
			<ChevronDownIcon
				className={cn(
					"size-4 shrink-0 text-muted-foreground",
					isOpen && "rotate-180",
				)}
			/>
		</div>
	);
}

function SkeletonRow({ titleWidth }: { titleWidth: string }) {
	return (
		<div
			className={cn(
				"flex min-h-11 items-center gap-3 px-3 py-[7px]",
				TABLE_TRAY_SURFACE_ROW_CLASS,
			)}
		>
			<div className="min-w-0 flex-1">
				<Skeleton className={cn("h-3.5", titleWidth)} />
			</div>
			<div className="w-[108px] shrink-0">
				<Skeleton className="h-[22px] w-[68px] rounded-md" />
			</div>
			<div className="flex w-[104px] shrink-0 justify-end">
				<Skeleton className="h-3.5 w-14" />
			</div>
		</div>
	);
}

/** Mirrors the loaded review: Plans open with one phase, the other groups collapsed. */
export function ReviewChangesSkeleton() {
	return (
		<div className="flex flex-col px-4 pt-1">
			<SkeletonGroupHeader system="autumn" title="Plans" isOpen />
			<div className={cn(TABLE_TRAY_CLASS, "mb-4")}>
				<div className="flex items-center justify-between px-2 pt-2 pb-1.5">
					<Skeleton className="h-3 w-10" />
					<Skeleton className="h-3 w-14" />
				</div>
				<div className={TABLE_TRAY_SURFACE_CLASS}>
					{SKELETON_TITLE_WIDTHS.map((titleWidth) => (
						<SkeletonRow key={titleWidth} titleWidth={titleWidth} />
					))}
				</div>
			</div>
			{COLLAPSED_GROUPS.map((group) => (
				<SkeletonGroupHeader
					key={group.title}
					system={group.system}
					title={group.title}
					isOpen={false}
				/>
			))}
		</div>
	);
}
