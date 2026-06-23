"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronRight } from "lucide-react";
import * as React from "react";
import {
	type ShortcutEntry,
	useMenuShortcuts,
} from "../../hooks/use-dropdown-shortcut";
import { cn } from "../../lib/utils";
import { SmallSpinner } from "../general/small-spinner";

const DropdownMenuContext = React.createContext<{
	isOpen: boolean;
	shortcuts: React.RefObject<ShortcutEntry[]>;
	close: () => void;
}>({
	isOpen: false,
	shortcuts: { current: [] },
	close: () => {},
});

const dropdownMenuItemVariants = cva(
	"group/dropdown-menu-item relative flex cursor-default select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground",
				destructive:
					"text-destructive focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20",
			},
			inset: {
				true: "pl-7",
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

function DropdownMenu(props: MenuPrimitive.Root.Props) {
	const isOpen = props.open ?? false;
	const { shortcuts, close } = useMenuShortcuts(isOpen, props.onOpenChange);

	const ctx = React.useMemo(
		() => ({ isOpen, shortcuts, close }),
		[isOpen, shortcuts, close],
	);

	return (
		<DropdownMenuContext.Provider value={ctx}>
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

function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
	return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuPortal({ children }: { children: React.ReactNode }) {
	return <>{children}</>;
}

function DropdownMenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
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
				"flex cursor-default gap-1.5 select-none items-center rounded-md px-1.5 py-1 text-sm text-muted-foreground outline-hidden focus:bg-accent focus:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				inset && "pl-7",
				className,
			)}
			{...rest}
		>
			{children}
			{withIcon && (
				<ChevronRight className="ml-auto size-3.5 text-tertiary-foreground" />
			)}
		</MenuPrimitive.SubmenuTrigger>
	);
});

const DropdownMenuSubContent = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.Popup.Props & {
		sideOffset?: number;
		alignOffset?: number;
	}
>(function DropdownMenuSubContent(props, ref) {
	const { className, sideOffset = 6, alignOffset = -4, ...rest } = props;
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				sideOffset={sideOffset}
				alignOffset={alignOffset}
				positionMethod="fixed"
				className="isolate z-[300] outline-none"
			>
				<MenuPrimitive.Popup
					ref={ref}
					data-slot="dropdown-menu-sub-content"
					className={cn(
						"min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-lg bg-interactive-secondary p-1 text-muted-foreground shadow-lg ring-1 ring-foreground/10 duration-100 origin-(--transform-origin)",
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
	keepMounted?: boolean;
};

const DropdownMenuContent = React.forwardRef<
	HTMLDivElement,
	DropdownMenuContentProps
>(function DropdownMenuContent(props, ref) {
	const {
		className,
		sideOffset = 4,
		side = "bottom",
		align = "start",
		onCloseAutoFocus: _onCloseAutoFocus,
		keepMounted = false,
		...rest
	} = props;
	return (
		<MenuPrimitive.Portal keepMounted={keepMounted}>
			<MenuPrimitive.Positioner
				sideOffset={sideOffset}
				side={side}
				align={align}
				positionMethod="fixed"
				className="isolate z-[300] outline-none"
			>
				<MenuPrimitive.Popup
					ref={ref}
					data-slot="dropdown-menu-content"
					className={cn(
						"max-h-(--available-height) min-w-32 overflow-x-hidden overflow-y-auto rounded-lg bg-interactive-secondary p-1 text-muted-foreground shadow-md ring-1 ring-foreground/10 duration-100 origin-(--transform-origin)",
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
		asChild?: boolean;
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
		asChild,
		closeOnClick,
		className,
		children,
		onClick,
		...rest
	} = props;
	const { shortcuts } = React.useContext(DropdownMenuContext);
	const onClickRef = React.useRef(onClick);
	onClickRef.current = onClick;

	React.useEffect(() => {
		if (!shortcut || props.disabled) return;
		const entry: ShortcutEntry = {
			key: shortcut,
			handler: () => onClickRef.current?.({} as any),
		};
		shortcuts.current.push(entry);
		return () => {
			shortcuts.current = shortcuts.current.filter((e) => e !== entry);
		};
	}, [shortcut, props.disabled, shortcuts]);

	if (asChild && React.isValidElement(children)) {
		return (
			<MenuPrimitive.Item
				ref={ref}
				data-slot="dropdown-menu-item"
				render={children}
				closeOnClick={closeOnClick}
				className={cn(
					dropdownMenuItemVariants({ variant, inset }),
					shimmer && "shimmer",
					className,
				)}
				disabled={shimmer || isLoading}
				onClick={onClick}
				{...rest}
			/>
		);
	}

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
	MenuPrimitive.CheckboxItem.Props & { inset?: boolean }
>(function DropdownMenuCheckboxItem(props, ref) {
	const { className, children, inset, ...rest } = props;
	return (
		<MenuPrimitive.CheckboxItem
			ref={ref}
			data-slot="dropdown-menu-checkbox-item"
			data-inset={inset}
			closeOnClick={false}
			className={cn(
				"relative flex cursor-default select-none items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...rest}
		>
			{children}
			<span className="pointer-events-none absolute right-2 flex items-center justify-center">
				<MenuPrimitive.CheckboxItemIndicator>
					<Check className="size-4" />
				</MenuPrimitive.CheckboxItemIndicator>
			</span>
		</MenuPrimitive.CheckboxItem>
	);
});

const DropdownMenuRadioItem = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.RadioItem.Props & { inset?: boolean }
>(function DropdownMenuRadioItem(props, ref) {
	const { className, children, inset, ...rest } = props;
	return (
		<MenuPrimitive.RadioItem
			ref={ref}
			data-slot="dropdown-menu-radio-item"
			data-inset={inset}
			className={cn(
				"relative flex cursor-default select-none items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...rest}
		>
			<span className="pointer-events-none absolute right-2 flex items-center justify-center">
				<MenuPrimitive.RadioItemIndicator>
					<Check className="size-4" />
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
			data-inset={inset}
			className={cn(
				"px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
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
			className={cn(
				"ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
				className,
			)}
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
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
};
