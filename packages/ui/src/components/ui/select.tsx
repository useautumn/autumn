"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "../../lib/utils";

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

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />;
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
				"[&_svg:not([class*='text-'])]:text-muted-foreground rounded-lg flex items-center justify-between gap-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 cursor-pointer",
				`input-base input-shadow-default input-state-open`,
				className,
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon>
				<ChevronDownIcon className="size-4 opacity-50" />
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
						"bg-interactive-secondary text-muted-foreground relative max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-x-hidden overflow-y-auto rounded-lg shadow-md ring-1 ring-foreground/10 p-1",
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
			className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
			{...props}
		/>
	);
}

function SelectItem({
	className,
	children,
	...props
}: SelectPrimitive.Item.Props) {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			className={cn(
				"data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				className,
			)}
			{...props}
		>
			<span className="pointer-events-none absolute right-2 flex items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<CheckIcon className="size-4" />
				</SelectPrimitive.ItemIndicator>
			</span>
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
			className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
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
