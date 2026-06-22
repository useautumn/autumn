"use client";

import { cn } from "@autumn/ui";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
	asChild,
	children,
	...props
}: SheetPrimitive.Trigger.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<SheetPrimitive.Trigger
				data-slot="sheet-trigger"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<SheetPrimitive.Trigger data-slot="sheet-trigger" {...props}>
			{children}
		</SheetPrimitive.Trigger>
	);
}

function SheetClose({
	asChild,
	children,
	...props
}: SheetPrimitive.Close.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<SheetPrimitive.Close
				data-slot="sheet-close"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<SheetPrimitive.Close data-slot="sheet-close" {...props}>
			{children}
		</SheetPrimitive.Close>
	);
}

function SheetPortal({
	container,
	...props
}: SheetPrimitive.Portal.Props & {
	container?: HTMLElement | null;
}) {
	const resolvedContainer =
		container ?? document.querySelector("[data-main-content]") ?? document.body;
	return (
		<SheetPrimitive.Portal
			data-slot="sheet-portal"
			container={resolvedContainer as HTMLElement | undefined}
			{...props}
		/>
	);
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
	return (
		<SheetPrimitive.Backdrop
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 z-[150] bg-white/70 dark:bg-black/70 transition-opacity duration-300 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
				className,
			)}
			{...props}
		/>
	);
}

const SIDE_STYLES = {
	right:
		"top-0 bottom-0 right-0 w-full md:top-2 md:bottom-2 md:right-3 md:min-w-xs md:max-w-md md:rounded-2xl md:border md:border-border/40 translate-x-0 data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
	left: "top-0 bottom-0 left-0 w-3/4 border-r border-border/40 sm:max-w-sm translate-x-0 data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
	top: "left-0 right-0 top-0 h-auto border-b border-border/40 translate-y-0 data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full",
	bottom:
		"left-0 right-0 bottom-0 h-auto border-t border-border/40 translate-y-0 data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
} as const;

function SheetContent({
	className,
	children,
	side = "right",
	hideCloseButton = false,
	portalContainer,
	...props
}: SheetPrimitive.Popup.Props & {
	side?: "top" | "right" | "bottom" | "left";
	hideCloseButton?: boolean;
	portalContainer?: HTMLElement | null;
}) {
	return (
		<SheetPortal container={portalContainer}>
			<SheetOverlay />
			<SheetPrimitive.Popup
				data-slot="sheet-content"
				className={cn(
					"bg-card fixed z-[150] flex flex-col gap-0 overflow-hidden transition-transform duration-300 ease-in-out",
					SIDE_STYLES[side],
					className,
				)}
				{...props}
			>
				{children}
				{!hideCloseButton && (
					<SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-open:bg-secondary absolute top-3 right-3 md:top-4 md:right-4 flex items-center justify-center size-10 md:size-auto rounded-sm md:rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
						<XIcon className="size-5 md:size-4" />
						<span className="sr-only">Close</span>
					</SheetPrimitive.Close>
				)}
			</SheetPrimitive.Popup>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1.5 p-4", className)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn("mt-auto flex flex-col gap-2 p-4", className)}
			{...props}
		/>
	);
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
	return (
		<SheetPrimitive.Title
			data-slot="sheet-title"
			className={cn("text-foreground font-semibold", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: SheetPrimitive.Description.Props) {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle };
