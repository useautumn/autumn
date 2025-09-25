/** biome-ignore-all lint/a11y/noStaticElementInteractions: shush */
"use client";

import { InfoIcon } from "@phosphor-icons/react";
import React from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Checkbox } from "./Checkbox";

interface AreaCheckboxProps {
	className?: string;
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	title: string;
	tooltip?: string;
	disabled?: boolean;
	children?: React.ReactNode;
}

function AreaCheckbox({
	className,
	checked = false,
	onCheckedChange,
	title,
	tooltip,
	disabled = false,
	children,
}: AreaCheckboxProps) {
	const id = React.useId();

	const handleToggle = () => {
		if (!disabled && onCheckedChange) {
			onCheckedChange(!checked);
		}
	};

	return (
		<div className={cn("space-y-3", className)}>
			{/* Header row with checkbox, title, and tooltip */}
			<div
				className="flex items-center gap-2 cursor-pointer"
				onClick={handleToggle}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						handleToggle();
					}
				}}
			>
				<Checkbox
					id={id}
					checked={checked}
					onCheckedChange={onCheckedChange}
					disabled={disabled}
					size="sm"
				/>
				<span className="text-form-label font-medium select-none">{title}</span>
				{tooltip && (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<InfoIcon className="size-3 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
							</TooltipTrigger>
							<TooltipContent className="max-w-xs">
								<p className="text-sm">{tooltip}</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				)}
			</div>

			{/* Expanded content */}
			{children && (
				<div
					className={cn(
						"ml-6 space-y-4",
						!checked && "opacity-50 pointer-events-none",
					)}
				>
					{children}
				</div>
			)}
		</div>
	);
}

export { AreaCheckbox };
