import { type Feature, findFeatureById } from "@autumn/shared";
import { Badge } from "@autumn/ui";
import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import { featureDisplayName } from "../../utils/featureDisplayName";
import { type RateCardRow as Row, rateText } from "../../utils/rateCardRows";

const BADGES = { changed: "Changed", added: "Added", excluded: "Not covered" };

/** One rate card row. With `source` it is read-only and says where the rate is set. */
export function RateCardRow({
	row,
	features,
	source,
	onClick,
	action,
}: {
	row: Row;
	features: Feature[];
	source?: string;
	onClick?: () => void;
	action?: ReactNode;
}) {
	const feature = findFeatureById({
		features,
		featureId: row.featureId,
		errorOnNotFound: false,
	});
	const name = featureDisplayName({ features, featureId: row.featureId });
	const setOnPlan = row.state === "changed" || row.state === "added";
	const badge = (state: keyof typeof BADGES) => (
		<Badge
			variant="muted"
			className={cn(
				"shrink-0 font-medium",
				state === "excluded" ? "text-tertiary-foreground" : "text-foreground",
			)}
		>
			{BADGES[state]}
		</Badge>
	);

	const content = (
		<>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="flex min-w-0 items-center gap-1.5">
					{!source && feature && (
						<span className="shrink-0 text-tertiary-foreground">
							{
								getFeatureIconConfig(
									feature.type,
									feature.config?.usage_type,
									14,
								).icon
							}
						</span>
					)}
					<span
						title={name}
						className={cn(
							"truncate text-sm",
							row.state === "excluded"
								? "text-tertiary-foreground"
								: "font-medium text-foreground",
						)}
					>
						{name}
					</span>
					{!source && setOnPlan && badge(row.state)}
				</span>
				{source && (
					<span
						className={cn(
							"flex items-center gap-1.5 text-xs",
							setOnPlan
								? "font-medium text-foreground"
								: "text-tertiary-foreground",
						)}
					>
						<span
							className={cn(
								"size-1.5 rounded-full",
								setOnPlan ? "bg-foreground" : "bg-subtle",
							)}
						/>
						{source}
					</span>
				)}
			</span>
			<span className="ml-auto flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-sm">
				{row.state === "changed" && (
					<s className="text-subtle text-xs">
						was{" "}
						{rateText({ rate: row.catalogRate, features }).replace(
							/ credits?$/,
							"",
						)}
					</s>
				)}
				{row.state === "excluded" ? (
					badge("excluded")
				) : (
					<span
						className={
							row.state === "inherited"
								? "text-tertiary-foreground"
								: "font-medium text-foreground"
						}
					>
						{rateText({ rate: row.rate, features })}
					</span>
				)}
			</span>
		</>
	);

	return (
		<li
			className={cn(
				TABLE_TRAY_SURFACE_DIVIDER_CLASS,
				"flex items-center gap-1.5 px-3",
				source ? "h-12" : "h-11",
				onClick && "hover:bg-table-row-hover",
			)}
		>
			{onClick ? (
				<button
					type="button"
					onClick={onClick}
					className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
				>
					{content}
				</button>
			) : (
				content
			)}
			{action}
		</li>
	);
}
