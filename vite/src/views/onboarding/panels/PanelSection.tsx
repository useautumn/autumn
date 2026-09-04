import { LoadingShimmerText, SectionTag } from "@autumn/ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The list-view shell — same bordered card, dashed-when-empty treatment, and
 * section label the Plans and Features tables use, minus the table machinery
 * (rows here nest, which TanStack rows can't). */
export function PanelSection({
	label,
	isLoading,
	isEmpty,
	loadingText,
	emptyText,
	children,
	className,
}: {
	label?: string;
	isLoading?: boolean;
	isEmpty?: boolean;
	loadingText?: string;
	emptyText?: string;
	children?: ReactNode;
	className?: string;
}) {
	const showPlaceholder = isLoading || isEmpty;

	return (
		<div className={cn("flex flex-col", className)}>
			{label && <SectionTag>{label}</SectionTag>}
			<div
				className={cn(
					"min-w-0 rounded-lg border bg-interactive-secondary",
					showPlaceholder && "border-dashed",
				)}
			>
				{showPlaceholder ? (
					<div className="flex h-13 items-center justify-center px-4">
						<span className="truncate text-xs text-subtle">
							{isLoading ? (
								<LoadingShimmerText text={loadingText ?? "Loading"} />
							) : (
								emptyText
							)}
						</span>
					</div>
				) : (
					<div className="divide-y">{children}</div>
				)}
			</div>
		</div>
	);
}

/** One row inside a PanelSection, matching the tables' h-10 row rhythm. */
export function PanelRow({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={cn("px-3 py-2", className)}>{children}</div>;
}

export function PanelOverflowRow({ children }: { children: ReactNode }) {
	return <div className="px-3 py-1.5 text-tiny text-subtle">{children}</div>;
}
