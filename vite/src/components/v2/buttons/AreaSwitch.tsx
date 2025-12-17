"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "./Switch";

interface AreaSwitchProps {
	className?: string;
	checked?: boolean;
	defaultChecked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	title: string;
	disabled?: boolean;
	hide?: boolean;
	description?: string;
	children?: React.ReactNode;
}

function AreaSwitch({
	className,
	checked: controlledChecked,
	defaultChecked = false,
	onCheckedChange,
	title,
	disabled = false,
	hide = false,
	description,
	children,
}: AreaSwitchProps) {
	const id = useId();
	const isControlled = controlledChecked !== undefined;
	const [internalChecked, setInternalChecked] = useState(defaultChecked);
	const checked = isControlled ? controlledChecked : internalChecked;

	if (hide) return null;

	const handleCheckedChange = (newChecked: boolean) => {
		if (disabled) return;
		if (!isControlled) {
			setInternalChecked(newChecked);
		}
		onCheckedChange?.(newChecked);
	};

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<Switch
				id={id}
				checked={checked}
				onCheckedChange={handleCheckedChange}
				disabled={disabled}
				className="ml-1"
			/>

			<div className="flex flex-col gap-1 w-full">
				<label
					htmlFor={id}
					className={cn(
						"text-t2 text-sm font-medium select-none w-fit",
						!disabled && "cursor-pointer hover:text-t1",
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

export { AreaSwitch };
