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
	variantVersions?: { version: number; minor_version: number }[] | null;
	selectedMinorVersion?: number;
	onSemverChange?: ({
		version,
		minorVersion,
	}: {
		version: number;
		minorVersion: number;
	}) => void;
}

export function PlanSectionTitle({
	hasCustomizations,
	numVersions,
	selectedVersion,
	onVersionChange,
	trialAction,
	variantVersions,
	selectedMinorVersion,
	onSemverChange,
}: PlanSectionTitleProps) {
	const useSemver = variantVersions && variantVersions.length > 0;
	const showVersionSelector =
		useSemver || (numVersions !== undefined && numVersions > 1);

	const versionOptions = useSemver
		? variantVersions.map((v) => ({
				label: `v${v.version}.${v.minor_version}`,
				value: `${v.version}.${v.minor_version}`,
			}))
		: numVersions !== undefined && numVersions > 1
			? Array.from(
					{ length: numVersions },
					(_, index) => numVersions - index,
				).map((version) => ({
					label: `Version ${version}`,
					value: String(version),
				}))
			: [];

	const currentValue = useSemver
		? selectedVersion !== undefined && selectedMinorVersion !== undefined
			? `${selectedVersion}.${selectedMinorVersion}`
			: versionOptions[0]?.value
		: selectedVersion !== undefined
			? String(selectedVersion)
			: undefined;

	const handleChange = (value: string) => {
		if (useSemver && onSemverChange) {
			const [maj, min] = value.split(".").map(Number);
			onSemverChange({ version: maj, minorVersion: min });
		} else {
			onVersionChange?.(Number(value));
		}
	};

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
					<Select value={currentValue} onValueChange={handleChange}>
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
