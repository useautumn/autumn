"use client";

import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
	return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
	return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
	...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
	return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
	container,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Portal> & {
	container?: HTMLElement | null;
}) {
	const resolvedContainer =
		container ?? document.querySelector("[data-main-content]");
	return (
		<SheetPrimitive.Portal
			data-slot="sheet-portal"
			container={resolvedContainer ?? undefined}
			{...props}
		/>
	);
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
	return (
		<SheetPrimitive.Overlay
			data-slot="sheet-overlay"
			className={cn(
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[150] bg-white/70 dark:bg-black/70",
				className,
			)}
			{...props}
		/>
	);
}

function SheetContent({
	className,
	children,
	side = "right",
	hideCloseButton = false,
	portalContainer,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
	side?: "top" | "right" | "bottom" | "left";
	hideCloseButton?: boolean;
	portalContainer?: HTMLElement | null;
}) {
	return (
		<SheetPortal container={portalContainer}>
			<SheetOverlay />
			<SheetPrimitive.Content
				data-slot="sheet-content"
				className={cn(
					"bg-card data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-[150] flex flex-col gap-0 shadow-sm transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-300",
					side === "right" &&
						`data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right top-0 bottom-0 right-0 w-full md:min-w-xs md:max-w-md md:border-l border-border/40`,
					side === "left" &&
						`data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left top-0 bottom-0 left-0 w-3/4 border-r border-border/40 sm:max-w-sm`,
					side === "top" &&
						"data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top left-0 right-0 top-0 h-auto border-b border-border/40",
					side === "bottom" &&
						"data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom left-0 right-0 bottom-0 h-auto border-t border-border/40",
					className,
				)}
				{...props}
			>
				{children}
				{!hideCloseButton && (
					<SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-3 right-3 md:top-4 md:right-4 flex items-center justify-center size-10 md:size-auto rounded-sm md:rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
						<XIcon className="size-5 md:size-4" />
						<span className="sr-only">Close</span>
					</SheetPrimitive.Close>
				)}
			</SheetPrimitive.Content>
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

function SheetTitle({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
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
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
	return (
		<SheetPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle };
