"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";

import SmallSpinner from "@/components/general/SmallSpinner";
import { cn } from "@/lib/utils";

// Context for sharing menu open state with items
const DropdownMenuContext = React.createContext<{ isOpen: boolean }>({
	isOpen: false,
});

// CVA variants for menu items
const dropdownMenuItemVariants = cva(
	"relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-t2 outline-hidden transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "hover:bg-accent focus:bg-accent",
				destructive:
					"hover:bg-destructive/10 focus:bg-destructive/10 text-destructive",
			},
			inset: {
				true: "pl-8",
				false: "",
			},
		},
		defaultVariants: {
			variant: "default",
			inset: false,
		},
	},
);

type DropdownMenuItemVariantProps = VariantProps<
	typeof dropdownMenuItemVariants
>;

// Root
function DropdownMenu(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>,
) {
	const isOpen = props.open ?? false;
	return (
		<DropdownMenuContext.Provider value={{ isOpen }}>
			<DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
		</DropdownMenuContext.Provider>
	);
}

// Trigger
const DropdownMenuTrigger = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Trigger>,
	React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>
>(function DropdownMenuTrigger(props, ref) {
	return (
		<DropdownMenuPrimitive.Trigger
			ref={ref}
			data-slot="dropdown-menu-trigger"
			{...props}
		/>
	);
});

// Group
function DropdownMenuGroup(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>,
) {
	return (
		<DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
	);
}

// Portal
function DropdownMenuPortal(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>,
) {
	return <DropdownMenuPrimitive.Portal {...props} />;
}

// Sub
function DropdownMenuSub(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>,
) {
	return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />;
}

// RadioGroup
function DropdownMenuRadioGroup(
	props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
) {
	return (
		<DropdownMenuPrimitive.RadioGroup
			data-slot="dropdown-menu-radio-group"
			{...props}
		/>
	);
}

// SubTrigger
type DropdownMenuSubTriggerProps = React.ComponentProps<
	typeof DropdownMenuPrimitive.SubTrigger
> & {
	inset?: boolean;
	withIcon?: boolean;
};

const DropdownMenuSubTrigger = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
	DropdownMenuSubTriggerProps
>(function DropdownMenuSubTrigger(props, ref) {
	const { inset, withIcon = true, className, children, ...rest } = props;
	return (
		<DropdownMenuPrimitive.SubTrigger
			ref={ref}
			data-slot="dropdown-menu-sub-trigger"
			className={cn(
				"flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm text-t2 outline-hidden hover:bg-accent focus:bg-accent data-[state=open]:bg-accent [&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0",
				inset && "pl-8",
				className,
			)}
			{...rest}
		>
			{children}
			{withIcon && <ChevronRight className="ml-auto text-t3" />}
		</DropdownMenuPrimitive.SubTrigger>
	);
});

// SubContent
const DropdownMenuSubContent = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
	React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>
>(function DropdownMenuSubContent(props, ref) {
	const { className, ...rest } = props;
	return (
		<DropdownMenuPrimitive.SubContent
			ref={ref}
			data-slot="dropdown-menu-sub-content"
			className={cn(
				"bg-interactive-secondary text-t2 z-[101] min-w-[8rem] overflow-hidden rounded-lg border p-1 shadow-md",
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
				className,
			)}
			{...rest}
		/>
	);
});

// Content
type DropdownMenuContentProps = React.ComponentProps<
	typeof DropdownMenuPrimitive.Content
> & {
	sideOffset?: number;
};

const DropdownMenuContent = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Content>,
	DropdownMenuContentProps
>(function DropdownMenuContent(props, ref) {
	const { className, sideOffset = 4, ...rest } = props;
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				ref={ref}
				data-slot="dropdown-menu-content"
				sideOffset={sideOffset}
				onCloseAutoFocus={(e) => e.preventDefault()}
				className={cn(
					"bg-interactive-secondary text-t2 z-[101] min-w-[8rem] overflow-hidden rounded-lg border p-1 shadow-md",
					"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
					className,
				)}
				{...rest}
			/>
		</DropdownMenuPrimitive.Portal>
	);
});

// Item
type DropdownMenuItemProps = React.ComponentProps<
	typeof DropdownMenuPrimitive.Item
> &
	DropdownMenuItemVariantProps & {
		isLoading?: boolean;
		shimmer?: boolean;
		/** Keyboard shortcut that triggers this item when the menu is open */
		shortcut?: string;
	};

const DropdownMenuItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Item>,
	DropdownMenuItemProps
>(function DropdownMenuItem(props, ref) {
	const {
		variant,
		inset,
		shimmer = false,
		isLoading,
		shortcut,
		className,
		children,
		onClick,
		...rest
	} = props;
	const { isOpen } = React.useContext(DropdownMenuContext);

	useHotkeys(
		shortcut ?? "",
		(e) => {
			e.preventDefault();
			onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
		},
		{
			enabled: !!shortcut && isOpen,
			enableOnFormTags: false,
		},
	);

	return (
		<DropdownMenuPrimitive.Item
			ref={ref}
			data-slot="dropdown-menu-item"
			className={cn(
				dropdownMenuItemVariants({ variant, inset }),
				shimmer && "shimmer",
				className,
			)}
			disabled={shimmer || isLoading}
			onClick={onClick}
			{...rest}
		>
			{isLoading ? (
				<>
					{children}
					<SmallSpinner />
				</>
			) : (
				<>
					{children}
					{/* {shortcut && (
						<span className="ml-auto text-xs tracking-widest text-t4 uppercase">
							{shortcut}
						</span>
					)} */}
				</>
			)}
		</DropdownMenuPrimitive.Item>
	);
});

// CheckboxItem
const DropdownMenuCheckboxItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
	React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem(props, ref) {
	const { className, children, ...rest } = props;
	return (
		<DropdownMenuPrimitive.CheckboxItem
			ref={ref}
			data-slot="dropdown-menu-checkbox-item"
			className={cn(
				"relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-1 pr-2 text-sm text-t2 outline-hidden transition-colors hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				className,
			)}
			{...rest}
		>
			{children}
			<span className="absolute right-2 flex size-3.5 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<Check className="size-4 text-t3" />
				</DropdownMenuPrimitive.ItemIndicator>
			</span>
		</DropdownMenuPrimitive.CheckboxItem>
	);
});

// RadioItem
const DropdownMenuRadioItem = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
	React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem(props, ref) {
	const { className, children, ...rest } = props;
	return (
		<DropdownMenuPrimitive.RadioItem
			ref={ref}
			data-slot="dropdown-menu-radio-item"
			className={cn(
				"relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-t2 outline-hidden transition-colors hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				className,
			)}
			{...rest}
		>
			<span className="absolute left-2 flex size-3.5 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<Circle className="size-2 fill-current" />
				</DropdownMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.RadioItem>
	);
});

// Label
type DropdownMenuLabelProps = React.ComponentProps<
	typeof DropdownMenuPrimitive.Label
> & {
	inset?: boolean;
};

const DropdownMenuLabel = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Label>,
	DropdownMenuLabelProps
>(function DropdownMenuLabel(props, ref) {
	const { inset, className, ...rest } = props;
	return (
		<DropdownMenuPrimitive.Label
			ref={ref}
			data-slot="dropdown-menu-label"
			className={cn(
				"px-2 py-1.5 text-sm font-semibold",
				inset && "pl-8",
				className,
			)}
			{...rest}
		/>
	);
});

// Separator
const DropdownMenuSeparator = React.forwardRef<
	React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
	React.ComponentProps<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator(props, ref) {
	const { className, ...rest } = props;
	return (
		<DropdownMenuPrimitive.Separator
			ref={ref}
			data-slot="dropdown-menu-separator"
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			{...rest}
		/>
	);
});

// Shortcut
type DropdownMenuShortcutProps = React.HTMLAttributes<HTMLSpanElement>;

function DropdownMenuShortcut(props: DropdownMenuShortcutProps) {
	const { className, ...rest } = props;
	return (
		<span
			data-slot="dropdown-menu-shortcut"
			className={cn("ml-auto text-xs tracking-widest text-t4", className)}
			{...rest}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
};
