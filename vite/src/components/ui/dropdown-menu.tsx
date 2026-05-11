"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import SmallSpinner from "../general/SmallSpinner";

function DropdownMenu({
	...props
}: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

const DropdownMenuTrigger = React.forwardRef<
	HTMLButtonElement,
	MenuPrimitive.Trigger.Props & { asChild?: boolean }
>(({ asChild, children, ...props }, ref) => {
	if (asChild && React.isValidElement(children)) {
		return (
			<MenuPrimitive.Trigger
				ref={ref}
				data-slot="dropdown-menu-trigger"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<MenuPrimitive.Trigger ref={ref} data-slot="dropdown-menu-trigger" {...props}>
			{children}
		</MenuPrimitive.Trigger>
	);
});
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

function DropdownMenuGroup({
	...props
}: MenuPrimitive.Group.Props) {
	return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuPortal({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}

function DropdownMenuSub({
	...props
}: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuRadioGroup({
	...props
}: MenuPrimitive.RadioGroup.Props) {
	return (
		<MenuPrimitive.RadioGroup
			data-slot="dropdown-menu-radio-group"
			{...props}
		/>
	);
}

const DropdownMenuSubTrigger = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.SubmenuTrigger.Props & {
		inset?: boolean;
		withIcon?: boolean;
	}
>(({ className, inset, children, withIcon = true, ...props }, ref) => (
	<MenuPrimitive.SubmenuTrigger
		ref={ref}
		data-slot="dropdown-menu-sub-trigger"
		className={cn(
			"flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-zinc-100 data-popup-open:bg-zinc-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 dark:focus:bg-zinc-800 dark:data-popup-open:bg-zinc-800",
			inset && "pl-8",
			className,
		)}
		{...props}
	>
		{children}
		{withIcon && <ChevronRight className="ml-auto text-t3" />}
	</MenuPrimitive.SubmenuTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

const DropdownMenuSubContent = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.Popup.Props & {
		sideOffset?: number;
	}
>(({ className, sideOffset = 0, ...props }, ref) => (
	<MenuPrimitive.Portal>
		<MenuPrimitive.Positioner
			sideOffset={sideOffset}
			positionMethod="fixed"
			className="isolate z-[200]"
		>
			<MenuPrimitive.Popup
				ref={ref}
				data-slot="dropdown-menu-sub-content"
				className={cn(
					"z-[200] min-w-[8rem] overflow-hidden rounded-md border border-zinc-200 bg-white p-1 shadow-lg data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 text-zinc-800 font-regular",
					className,
				)}
				{...props}
			/>
		</MenuPrimitive.Positioner>
	</MenuPrimitive.Portal>
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

const DropdownMenuContent = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.Popup.Props & {
		sideOffset?: number;
		side?: "top" | "bottom" | "left" | "right";
		align?: "start" | "center" | "end";
		onCloseAutoFocus?: (e: any) => void;
	}
>(({ className, sideOffset = 4, side = "bottom", align = "start", onCloseAutoFocus: _onCloseAutoFocus, ...props }, ref) => (
	<MenuPrimitive.Portal>
		<MenuPrimitive.Positioner
			sideOffset={sideOffset}
			side={side}
			align={align}
			positionMethod="fixed"
			className="isolate z-[200] outline-none"
		>
			<MenuPrimitive.Popup
				ref={ref}
				data-slot="dropdown-menu-content"
				className={cn(
					"z-[200] min-w-[8rem] overflow-hidden rounded-md border border-zinc-200 bg-white p-1 text-zinc-950 shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50",
					"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
					className,
				)}
				{...props}
			/>
		</MenuPrimitive.Positioner>
	</MenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

const DropdownMenuItem = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.Item.Props & {
		inset?: boolean;
		isLoading?: boolean;
		shimmer?: boolean;
		asChild?: boolean;
	}
>(({ className, inset, shimmer = false, isLoading, children, asChild, ...props }, ref) => {
	if (asChild && React.isValidElement(children)) {
		return (
			<MenuPrimitive.Item
				ref={ref}
				data-slot="dropdown-menu-item"
				closeOnClick={false}
				render={children}
				className={cn(
					"relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
					shimmer && "shimmer",
					inset && "pl-8",
					className,
				)}
				disabled={shimmer || isLoading}
				{...props}
			/>
		);
	}
	return (
		<MenuPrimitive.Item
			ref={ref}
			data-slot="dropdown-menu-item"
			closeOnClick={false}
			className={cn(
				"relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
				shimmer && "shimmer",
				inset && "pl-8",
				className,
			)}
			disabled={shimmer || isLoading}
			{...props}
		>
			{isLoading ? (
				<>
					{children}
					<SmallSpinner />
				</>
			) : (
				children
			)}
		</MenuPrimitive.Item>
	);
});
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuCheckboxItem = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.CheckboxItem.Props
>(({ className, children, checked, ...props }, ref) => (
	<MenuPrimitive.CheckboxItem
		ref={ref}
		data-slot="dropdown-menu-checkbox-item"
		className={cn(
			"relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-1 pr-2 text-sm outline-none transition-colors focus:bg-zinc-100 focus:text-zinc-900 data-disabled:pointer-events-none data-disabled:opacity-50 dark:focus:bg-zinc-800 dark:focus:text-zinc-50",
			className,
		)}
		checked={checked}
		{...props}
	>
		{children}
		<span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
			<MenuPrimitive.CheckboxItemIndicator>
				<Check className="h-4 w-4 text-t3" />
			</MenuPrimitive.CheckboxItemIndicator>
		</span>
	</MenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

const DropdownMenuRadioItem = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.RadioItem.Props
>(({ className, children, ...props }, ref) => (
	<MenuPrimitive.RadioItem
		ref={ref}
		data-slot="dropdown-menu-radio-item"
		className={cn(
			"relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-zinc-100 focus:text-zinc-900 data-disabled:pointer-events-none data-disabled:opacity-50 dark:focus:bg-zinc-800 dark:focus:text-zinc-50",
			className,
		)}
		{...props}
	>
		<span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
			<MenuPrimitive.RadioItemIndicator>
				<Circle className="h-2 w-2 fill-current" />
			</MenuPrimitive.RadioItemIndicator>
		</span>
		{children}
	</MenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

const DropdownMenuLabel = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.GroupLabel.Props & {
		inset?: boolean;
	}
>(({ className, inset, ...props }, ref) => (
	<MenuPrimitive.GroupLabel
		ref={ref}
		data-slot="dropdown-menu-label"
		className={cn(
			"px-2 py-1.5 text-sm font-semibold",
			inset && "pl-8",
			className,
		)}
		{...props}
	/>
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

const DropdownMenuSeparator = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.Separator.Props
>(({ className, ...props }, ref) => (
	<MenuPrimitive.Separator
		ref={ref}
		data-slot="dropdown-menu-separator"
		className={cn("-mx-1 my-1 h-px bg-zinc-100 dark:bg-zinc-800", className)}
		{...props}
	/>
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

const DropdownMenuShortcut = ({
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
	return (
		<span
			className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
			{...props}
		/>
	);
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuGroup,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
};
