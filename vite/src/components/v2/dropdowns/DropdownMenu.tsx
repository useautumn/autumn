"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";

import SmallSpinner from "@/components/general/SmallSpinner";
import { cn } from "@/lib/utils";

const DropdownMenuContext = React.createContext<{ isOpen: boolean }>({
	isOpen: false,
});

const dropdownMenuItemVariants = cva(
	"relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-t2 outline-hidden transition-colors data-disabled:pointer-events-none data-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
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

function DropdownMenu(
	props: MenuPrimitive.Root.Props,
) {
	const isOpen = props.open ?? false;
	return (
		<DropdownMenuContext.Provider value={{ isOpen }}>
			<MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
		</DropdownMenuContext.Provider>
	);
}

const DropdownMenuTrigger = React.forwardRef<
	HTMLButtonElement,
	MenuPrimitive.Trigger.Props & { asChild?: boolean }
>(function DropdownMenuTrigger({ asChild, children, ...props }, ref) {
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
		<MenuPrimitive.Trigger
			ref={ref}
			data-slot="dropdown-menu-trigger"
			{...props}
		>
			{children}
		</MenuPrimitive.Trigger>
	);
});

function DropdownMenuGroup(
	props: MenuPrimitive.Group.Props,
) {
	return (
		<MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
	);
}

function DropdownMenuPortal({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}

function DropdownMenuSub(
	props: MenuPrimitive.SubmenuRoot.Props,
) {
	return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuRadioGroup(
	props: MenuPrimitive.RadioGroup.Props,
) {
	return (
		<MenuPrimitive.RadioGroup
			data-slot="dropdown-menu-radio-group"
			{...props}
		/>
	);
}

type DropdownMenuSubTriggerProps = MenuPrimitive.SubmenuTrigger.Props & {
	inset?: boolean;
	withIcon?: boolean;
};

const DropdownMenuSubTrigger = React.forwardRef<
	HTMLDivElement,
	DropdownMenuSubTriggerProps
>(function DropdownMenuSubTrigger(props, ref) {
	const { inset, withIcon = true, className, children, ...rest } = props;
	return (
		<MenuPrimitive.SubmenuTrigger
			ref={ref}
			data-slot="dropdown-menu-sub-trigger"
			className={cn(
				"flex cursor-pointer gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm text-t2 outline-hidden hover:bg-accent focus:bg-accent data-popup-open:bg-accent [&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0",
				inset && "pl-8",
				className,
			)}
			{...rest}
		>
			{children}
			{withIcon && <ChevronRight className="ml-auto text-t3" />}
		</MenuPrimitive.SubmenuTrigger>
	);
});

const DropdownMenuSubContent = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.Popup.Props & { sideOffset?: number }
>(function DropdownMenuSubContent(props, ref) {
	const { className, sideOffset = 0, ...rest } = props;
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				sideOffset={sideOffset}
				positionMethod="fixed"
				className="isolate z-[160]"
			>
				<MenuPrimitive.Popup
					ref={ref}
					data-slot="dropdown-menu-sub-content"
					className={cn(
						"bg-interactive-secondary text-t2 min-w-[8rem] overflow-hidden rounded-lg border p-1 shadow-md",
						"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
						className,
					)}
					{...rest}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
});

type DropdownMenuContentProps = MenuPrimitive.Popup.Props & {
	sideOffset?: number;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
	onCloseAutoFocus?: (e: any) => void;
};

const DropdownMenuContent = React.forwardRef<
	HTMLDivElement,
	DropdownMenuContentProps
>(function DropdownMenuContent(props, ref) {
	const { className, sideOffset = 4, side = "bottom", align = "start", onCloseAutoFocus: _onCloseAutoFocus, ...rest } = props;
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				sideOffset={sideOffset}
				side={side}
				align={align}
				positionMethod="fixed"
				className="isolate z-[160] outline-none"
			>
				<MenuPrimitive.Popup
					ref={ref}
					data-slot="dropdown-menu-content"
					className={cn(
						"bg-interactive-secondary text-t2 min-w-[8rem] overflow-hidden rounded-lg border p-1 shadow-md",
						"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
						className,
					)}
					{...rest}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
});

type DropdownMenuItemProps = MenuPrimitive.Item.Props &
	DropdownMenuItemVariantProps & {
		isLoading?: boolean;
		shimmer?: boolean;
		shortcut?: string;
		closeOnClick?: boolean;
	};

const DropdownMenuItem = React.forwardRef<
	HTMLDivElement,
	DropdownMenuItemProps
>(function DropdownMenuItem(props, ref) {
	const {
		variant,
		inset,
		shimmer = false,
		isLoading,
		shortcut,
		closeOnClick = false,
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
			onClick?.(e as any);
		},
		{
			enabled: !!shortcut && isOpen,
			enableOnFormTags: false,
		},
	);

	return (
		<MenuPrimitive.Item
			ref={ref}
			data-slot="dropdown-menu-item"
			closeOnClick={closeOnClick}
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
				children
			)}
		</MenuPrimitive.Item>
	);
});

const DropdownMenuCheckboxItem = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.CheckboxItem.Props
>(function DropdownMenuCheckboxItem(props, ref) {
	const { className, children, ...rest } = props;
	return (
		<MenuPrimitive.CheckboxItem
			ref={ref}
			data-slot="dropdown-menu-checkbox-item"
			className={cn(
				"relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-1 pr-2 text-sm text-t2 outline-hidden transition-colors hover:bg-accent focus:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50",
				className,
			)}
			{...rest}
		>
			{children}
			<span className="absolute right-2 flex size-3.5 items-center justify-center">
				<MenuPrimitive.CheckboxItemIndicator>
					<Check className="size-4 text-t3" />
				</MenuPrimitive.CheckboxItemIndicator>
			</span>
		</MenuPrimitive.CheckboxItem>
	);
});

const DropdownMenuRadioItem = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.RadioItem.Props
>(function DropdownMenuRadioItem(props, ref) {
	const { className, children, ...rest } = props;
	return (
		<MenuPrimitive.RadioItem
			ref={ref}
			data-slot="dropdown-menu-radio-item"
			className={cn(
				"relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-t2 outline-hidden transition-colors hover:bg-accent focus:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50",
				className,
			)}
			{...rest}
		>
			<span className="absolute left-2 flex size-3.5 items-center justify-center">
				<MenuPrimitive.RadioItemIndicator>
					<Circle className="size-2 fill-current" />
				</MenuPrimitive.RadioItemIndicator>
			</span>
			{children}
		</MenuPrimitive.RadioItem>
	);
});

type DropdownMenuLabelProps = MenuPrimitive.GroupLabel.Props & {
	inset?: boolean;
};

const DropdownMenuLabel = React.forwardRef<
	HTMLDivElement,
	DropdownMenuLabelProps
>(function DropdownMenuLabel(props, ref) {
	const { inset, className, ...rest } = props;
	return (
		<MenuPrimitive.GroupLabel
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

const DropdownMenuSeparator = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.Separator.Props
>(function DropdownMenuSeparator(props, ref) {
	const { className, ...rest } = props;
	return (
		<MenuPrimitive.Separator
			ref={ref}
			data-slot="dropdown-menu-separator"
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			{...rest}
		/>
	);
});

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
