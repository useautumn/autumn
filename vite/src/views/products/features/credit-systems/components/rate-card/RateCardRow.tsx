import { type Feature, findFeatureById } from "@autumn/shared";
import {
	Badge,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@autumn/ui";
import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { getFeatureIcon } from "@/views/products/features/utils/getFeatureIcon";
import { rateText } from "../../utils/creditRateSummary";
import { featureDisplayName } from "../../utils/featureDisplayName";
import type { RateCardRow as Row } from "../../utils/rateCardRows";

const stateBadge = (label: string, muted = false) => (
	<Badge
		variant="muted"
		className={cn(
			"shrink-0 font-medium",
			muted ? "text-tertiary-foreground" : "text-foreground",
		)}
	>
		{label}
	</Badge>
);

/** The rate, after the one it replaced: "<s>3</s> → 2.857 credits", with a shared unit written once. */
const rateValue = ({ row, features }: { row: Row; features: Feature[] }) => {
	if (row.state === "excluded") return stateBadge("Not covered", true);
	const to = rateText({ rate: row.rate, features });
	const from =
		row.state === "changed" && rateText({ rate: row.catalogRate, features });
	const unit = to.replace(/^\S+/, "");
	return (
		<>
			{from && (
				<>
					<s className="text-tertiary-foreground">
						{from.endsWith(unit) ? from.slice(0, -unit.length) : from}
					</s>
					<span className="text-tertiary-foreground">→</span>
				</>
			)}
			<span
				className={
					row.state === "inherited"
						? "text-tertiary-foreground"
						: "font-medium text-foreground"
				}
			>
				{to}
			</span>
		</>
	);
};

/** Where a read-only row's rate is set, e.g. "Set on Starter Monthly". */
const sourceLabel = ({
	row,
	planName,
	creditSystemName,
}: {
	row: Row;
	planName: string;
	creditSystemName?: string;
}) => {
	if (row.state === "inherited") return `From ${creditSystemName}`;
	return `${row.state === "excluded" ? "Removed" : "Set"} on ${planName}`;
};

/** The rate with a tooltip repeating the change and saying where it is set. */
const rateWithSource = ({
	rate,
	row,
	features,
	source,
}: {
	rate: ReactNode;
	row: Row;
	features: Feature[];
	source: string;
}) => (
	<TooltipProvider>
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>
				<span className="flex items-baseline gap-1.5">{rate}</span>
			</TooltipTrigger>
			<TooltipContent>
				<div className="flex items-baseline gap-1.5">
					{row.state === "excluded" ? (
						<>
							<s>
								{rateText({ rate: row.catalogRate, features }).split(" ")[0]}
							</s>
							<span>→ Not covered</span>
						</>
					) : (
						rateValue({ row, features })
					)}
				</div>
				<div className="text-tertiary-foreground">{source}</div>
			</TooltipContent>
		</Tooltip>
	</TooltipProvider>
);

/** Icon, plus the "Added" badge on the editable plan card. */
const rowExtras = ({
	row,
	features,
	planName,
}: {
	row: Row;
	features: Feature[];
	planName?: string;
}) => {
	const feature = findFeatureById({
		features,
		featureId: row.featureId,
		errorOnNotFound: false,
	});
	return {
		icon: feature && (
			<span className="shrink-0">{getFeatureIcon({ feature, size: 14 })}</span>
		),
		badge: !planName && row.state === "added" && stateBadge("Added"),
	};
};

/** One rate card row: editable on the plan; read-only with `planName` (a tooltip says where the rate is set) or `dense` (save dialog). */
export function RateCardRow({
	row,
	features,
	planName,
	creditSystemName,
	dense = false,
	onClick,
	action,
}: {
	row: Row;
	features: Feature[];
	planName?: string;
	creditSystemName?: string;
	dense?: boolean;
	onClick?: () => void;
	action?: ReactNode;
}) {
	const name = featureDisplayName({ features, featureId: row.featureId });
	const extras = dense ? null : rowExtras({ row, features, planName });
	const rate = rateValue({ row, features });

	const content = (
		<>
			<span className="flex min-w-0 items-center gap-1.5">
				{extras?.icon}
				<span
					title={name}
					className={cn(
						"truncate",
						!dense && "text-sm",
						row.state === "excluded"
							? "text-tertiary-foreground"
							: "font-medium text-foreground",
					)}
				>
					{name}
				</span>
				{extras?.badge}
			</span>
			<span
				className={cn(
					"ml-auto flex shrink-0 items-baseline gap-1.5 whitespace-nowrap",
					!dense && "text-sm",
				)}
			>
				{planName === undefined
					? rate
					: rateWithSource({
							rate,
							row,
							features,
							source: sourceLabel({ row, planName, creditSystemName }),
						})}
			</span>
		</>
	);

	return (
		<li
			className={cn(
				"flex items-center gap-1.5",
				dense
					? "border-input border-t py-1.5 text-xs"
					: [TABLE_TRAY_SURFACE_DIVIDER_CLASS, "h-11 px-3"],
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
