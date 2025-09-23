"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "./checkbox";

interface LongCheckboxProps {
	className?: string;
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	title: string;
	subtitle?: string;
	disabled?: boolean;
}

function LongCheckbox({
	className,
	checked = false,
	onCheckedChange,
	title,
	subtitle,
	disabled = false,
}: LongCheckboxProps) {
	const id = React.useId();

	return (
		<label
			htmlFor={id}
			className={cn(
				"flex items-start gap-2 px-2 rounded-lg border bg-white",
				"!py-2",
				!disabled && "form-select form-input",
				checked && "form-focus-border !bg-active-primary",
				disabled && "opacity-80 cursor-not-allowed",
				className,
			)}
		>
			<Checkbox
				id={id}
				checked={checked}
				onCheckedChange={onCheckedChange}
				disabled={disabled}
				className="hover:border-default hover:bg-default mt-1"
				size="sm"
			/>
			<div className="flex flex-col gap-0.5 flex-1">
				<div className="text-form-text">{title}</div>
				{subtitle && (
					<div className="text-xs text-body-secondary">{subtitle}</div>
				)}
			</div>
		</label>
	);
}

export { LongCheckbox };
