"use client";

import { useId } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { RadioGroupItem } from "./RadioGroup";

interface AreaRadioGroupItemProps {
	className?: string;
	value: string;
	label: string;
	description?: string;
	disabled?: boolean;
	disabledReason?: string;
}

function AreaRadioGroupItem({
	className,
	value,
	label,
	description,
	disabled = false,
	disabledReason,
}: AreaRadioGroupItemProps) {
	const id = useId();

	const isDisabled = disabled || !!disabledReason;

	const content = (
		<div className={cn("flex items-start space-x-[6px]", className)}>
			<RadioGroupItem
				value={value}
				id={id}
				className="mt-[3px]"
				disabled={isDisabled}
			/>
			<div className="flex-1 space-y-1">
				<div className="flex items-center gap-2">
					<label
						htmlFor={id}
						className={cn(
							"text-checkbox-label cursor-pointer",
							isDisabled && "cursor-not-allowed opacity-50",
						)}
					>
						{label}
					</label>
				</div>
				{description && (
					<p className="text-body-sec-paragraph">{description}</p>
				)}
			</div>
		</div>
	);

	if (disabledReason) {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<div>{content}</div>
				</TooltipTrigger>
				<TooltipContent side="top" className="max-w-60">
					{disabledReason}
				</TooltipContent>
			</Tooltip>
		);
	}

	return content;
}

export { AreaRadioGroupItem };
