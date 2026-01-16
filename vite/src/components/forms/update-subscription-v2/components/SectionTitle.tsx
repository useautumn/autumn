import { InfoIcon } from "@phosphor-icons/react";
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
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface SectionTitleProps {
	hasCustomizations: boolean;
	form?: UseUpdateSubscriptionForm;
	numVersions?: number;
	currentVersion?: number;
}

export function SectionTitle({
	hasCustomizations,
	form,
	numVersions,
	currentVersion,
}: SectionTitleProps) {
	const showVersionSelector =
		form && numVersions !== undefined && numVersions > 1;

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
							This subscription's configuration was edited. See changes below.
						</TooltipContent>
					</Tooltip>
				)}
			</span>
			{showVersionSelector && (
				<form.AppField name="version">
					{(field) => (
						<Select
							value={String(field.state.value ?? currentVersion)}
							onValueChange={(value) => field.handleChange(Number(value))}
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
				</form.AppField>
			)}
		</span>
	);
}
