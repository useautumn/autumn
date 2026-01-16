/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
"use client";

import React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { cn } from "@/lib/utils";
import { Checkbox } from "./Checkbox";

interface AreaCheckboxProps {
	className?: string;
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	title: string;
	tooltip?: string;
	disabled?: boolean;
	disabledReason?: string;
	hide?: boolean;
	description?: string;
	children?: React.ReactNode;
}

function AreaCheckbox({
	checked = false,
	onCheckedChange,
	title,
	disabled = false,
	disabledReason,
	hide = false,
	description,
	children,
}: AreaCheckboxProps) {
	const id = React.useId();

	if (hide) return null;

	const isDisabled = disabled || !!disabledReason;

	const content = (
		<div className="flex items-start gap-[6px] text-sm">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(checked) => {
					if (!isDisabled && onCheckedChange) {
						onCheckedChange(checked as boolean);
					}
				}}
				disabled={isDisabled}
				size="sm"
				className="mt-[3px]"
			/>

			<div className="flex flex-col w-full">
				<label
					htmlFor={id}
					className={cn(
						"text-t2 font-medium select-none w-fit",
						!isDisabled && "hover:text-t1",
						isDisabled && "cursor-not-allowed opacity-50",
					)}
				>
					{title}
				</label>
				{/* Expanded content */}
				{(children || description) && (
					<div
						className={cn(
							"grid transition-all duration-200",
							checked
								? "grid-rows-[1fr] opacity-100"
								: "grid-rows-[0fr] opacity-0",
						)}
					>
						<div className="overflow-hidden space-y-2">
							{description && <p className="text-t3">{description}</p>}
							{children}
						</div>
					</div>
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
				<TooltipContent side="left" className="max-w-60">
					{disabledReason}
				</TooltipContent>
			</Tooltip>
		);
	}

	return content;
}

export { AreaCheckbox };
