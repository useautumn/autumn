import { type Feature, findFeatureById } from "@autumn/shared";
import { Badge } from "@autumn/ui";
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

/** Where a read-only row's rate is set, with a dot that is solid when the plan set it. */
const sourceLine = ({
	row,
	planName,
	creditSystemName,
}: {
	row: Row;
	planName: string;
	creditSystemName?: string;
}) => {
	const setOnPlan = row.state === "changed" || row.state === "added";
	const verb = row.state === "excluded" ? "Removed" : "Set";
	const label =
		row.state === "inherited"
			? `From ${creditSystemName}`
			: `${verb} on ${planName}`;
	return (
		<span
			className={cn(
				"flex items-center gap-1.5 text-xs",
				setOnPlan ? "font-medium text-foreground" : "text-tertiary-foreground",
			)}
		>
			<span
				className={cn(
					"size-1.5 rounded-full",
					setOnPlan ? "bg-foreground" : "bg-subtle",
				)}
			/>
			{label}
		</span>
	);
};

/** Icon and "Added" badge, shown only on the editable plan card. */
const editableExtras = ({
	row,
	features,
}: {
	row: Row;
	features: Feature[];
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
		badge: row.state === "added" && stateBadge("Added"),
	};
};

/** One rate card row: editable on the plan; read-only with `planName` (says where the rate is set) or `dense` (save dialog). */
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
	const readOnly = dense || planName !== undefined;
	const extras = readOnly ? null : editableExtras({ row, features });

	const content = (
		<>
			<span className="flex min-w-0 flex-col gap-0.5">
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
				{planName !== undefined &&
					sourceLine({ row, planName, creditSystemName })}
			</span>
			<span
				className={cn(
					"ml-auto flex shrink-0 items-baseline gap-1.5 whitespace-nowrap",
					!dense && "text-sm",
				)}
			>
				{rateValue({ row, features })}
			</span>
		</>
	);

	return (
		<li
			className={cn(
				"flex items-center gap-1.5",
				dense
					? "border-input border-t py-1.5 text-xs"
					: [
							TABLE_TRAY_SURFACE_DIVIDER_CLASS,
							"px-3",
							planName === undefined ? "h-11" : "h-12",
						],
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
