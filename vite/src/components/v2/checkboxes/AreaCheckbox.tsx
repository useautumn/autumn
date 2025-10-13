/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "./Checkbox";

interface AreaCheckboxProps {
	className?: string;
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	title: string;
	tooltip?: string;
	disabled?: boolean;
	hide?: boolean;
	description?: string;
	children?: React.ReactNode;
}

function AreaCheckbox({
	className,
	checked = false,
	onCheckedChange,
	title,
	tooltip,
	disabled = false,
	hide = false,
	description,
	children,
}: AreaCheckboxProps) {
	const id = React.useId();

	if (hide) return null;
	return (
		<div className="flex items-start gap-[6px]">
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={(checked) => {
					if (!disabled && onCheckedChange) {
						onCheckedChange(checked as boolean);
					}
				}}
				disabled={disabled}
				size="sm"
				className="mt-[3px]"
			/>

			<div className="flex flex-col gap-[4px]">
				<label
					htmlFor={id}
					className={cn(
						"text-checkbox-label font-medium select-none",
						!disabled && "hover:!text-t1",
						!checked && "opacity-50",
						disabled && "cursor-not-allowed",
					)}
				>
					{title}
				</label>
				{/* Expanded content */}
				{(children || description) && (
					<div
						className={cn(
							"space-y-2",
							!checked && "opacity-50 pointer-events-none",
						)}
					>
						{description && <p className="text-form-label">{description}</p>}
						{children}
					</div>
				)}
			</div>
		</div>
	);
}

export { AreaCheckbox };

// {tooltip && (
// 	<TooltipProvider>
// 		<Tooltip>
// 			<TooltipTrigger asChild>
// 				<InfoIcon className="size-3 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
// 			</TooltipTrigger>
// 			<TooltipContent className="max-w-xs">
// 				<p className="text-sm">{tooltip}</p>
// 			</TooltipContent>
// 		</Tooltip>
// 	</TooltipProvider>
// )}
