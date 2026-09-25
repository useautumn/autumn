"use client";

import {
	overlayItemClassName,
	overlayItemHighlightClassName,
	overlayItemIndicatorClassName,
	overlayLabelClassName,
	overlaySeparatorClassName,
	overlaySurfaceClassName,
} from "@autumn/ui/lib/overlay-classes";
import { cn } from "@autumn/ui/lib/utils";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type * as React from "react";

function Select({
	onValueChange,
	onOpenChange,
	value,
	defaultValue,
	items,
	...props
}: Omit<
	SelectPrimitive.Root.Props<string>,
	"onValueChange" | "onOpenChange"
> & {
	onValueChange?: (value: string) => void;
	onOpenChange?: (open: boolean) => void;
	value?: string;
	defaultValue?: string;
	items?:
		| Record<string, string>
		| ReadonlyArray<{ label: string; value: string }>;
}) {
	const Root = SelectPrimitive.Root<string>;
	return (
		<Root
			data-slot="select"
			value={value}
			defaultValue={defaultValue}
			items={items}
			onValueChange={
				onValueChange ? (val) => onValueChange(val as string) : undefined
			}
			onOpenChange={onOpenChange ? (open) => onOpenChange(open) : undefined}
			{...props}
		/>
	);
}

function SelectGroup({ ...props }: SelectPrimitive.Group.Props) {
	return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
	return (
		<SelectPrimitive.Value
			data-slot="select-value"
			className={cn("min-w-0 truncate", className)}
			{...props}
		/>
	);
}

function SelectTrigger({
	className,
	size = "default",
	children,
	...props
}: SelectPrimitive.Trigger.Props & {
	size?: "sm" | "default";
}) {
	return (
		<SelectPrimitive.Trigger
			data-slot="select-trigger"
			data-size={size}
			className={cn(
				"[&_svg:not([class*='text-'])]:text-muted-foreground rounded-lg flex items-center justify-between gap-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer min-w-0 whitespace-nowrap",
				`input-base input-shadow-default input-state-open`,
				className,
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon>
				<ChevronDownIcon className="size-3.5 text-tertiary-foreground" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

function SelectContent({
	className,
	children,
	align = "start",
	sideOffset = 4,
	side = "bottom",
	...props
}: SelectPrimitive.Popup.Props & {
	align?: "start" | "center" | "end";
	sideOffset?: number;
	side?: "top" | "bottom" | "left" | "right";
}) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Positioner
				align={align}
				sideOffset={sideOffset}
				side={side}
				alignItemWithTrigger={false}
				positionMethod="fixed"
				className="isolate z-[300] outline-none"
			>
				<SelectPrimitive.Popup
					data-slot="select-content"
					className={cn(
						"relative max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-x-hidden overflow-y-auto p-1",
						overlaySurfaceClassName,
						className,
					)}
					{...props}
				>
					{children}
				</SelectPrimitive.Popup>
			</SelectPrimitive.Positioner>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({
	className,
	...props
}: SelectPrimitive.GroupLabel.Props) {
	return (
		<SelectPrimitive.GroupLabel
			data-slot="select-label"
			className={cn(overlayLabelClassName, className)}
			{...props}
		/>
	);
}

function SelectItem({
	className,
	children,
	indicator = true,
	...props
}: SelectPrimitive.Item.Props & {
	/** Opt out when the row already reads as selected without a checkmark. */
	indicator?: boolean;
}) {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			className={cn(
				overlayItemClassName,
				overlayItemHighlightClassName,
				"w-full *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				indicator ? "pr-8" : "pr-2",
				className,
			)}
			{...props}
		>
			{indicator ? (
				<span className={overlayItemIndicatorClassName}>
					<SelectPrimitive.ItemIndicator>
						<CheckIcon className="text-foreground" />
					</SelectPrimitive.ItemIndicator>
				</span>
			) : null}
			<SelectPrimitive.ItemText className="flex items-center gap-2">
				{children}
			</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="select-separator"
			className={cn(
				overlaySeparatorClassName,
				"pointer-events-none",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
};
