import { InfoIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";

interface PlanSectionTitleProps {
	hasCustomizations: boolean;
	numVersions?: number;
	selectedVersion?: number;
	onVersionChange?: (version: number) => void;
	trialAction?: ReactNode;
}

export function PlanSectionTitle({
	hasCustomizations,
	numVersions,
	selectedVersion,
	onVersionChange,
	trialAction,
}: PlanSectionTitleProps) {
	const showVersionSelector = numVersions !== undefined && numVersions > 1;

	const versionOptions = showVersionSelector
		? Array.from(
				{ length: numVersions },
				(_, index) => numVersions - index,
			).map((version) => ({
				label: `Version ${version}`,
				value: String(version),
			}))
		: [];

	return (
		<span className="flex items-center justify-between w-full gap-2">
			<span className="flex items-center gap-1.5">
				Plan Configuration
				{hasCustomizations && (
					<Tooltip>
						<TooltipTrigger asChild>
							<InfoIcon
								size={14}
								weight="fill"
								className="text-amber-500 cursor-help"
							/>
						</TooltipTrigger>
						<TooltipContent side="top">
							Plan configuration has been customized. See changes below.
						</TooltipContent>
					</Tooltip>
				)}
			</span>
			<span className="flex items-center gap-2">
				{trialAction}
				{showVersionSelector && (
					<Select
						value={
							selectedVersion !== undefined
								? String(selectedVersion)
								: undefined
						}
						onValueChange={(value) => onVersionChange?.(Number(value))}
					>
						<SelectTrigger className="w-fit h-7 text-xs whitespace-nowrap">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{versionOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</span>
		</span>
	);
}
