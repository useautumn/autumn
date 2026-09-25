"use client";

import { cn } from "@autumn/ui/lib/utils";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
	asChild,
	children,
	...props
}: DialogPrimitive.Trigger.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<DialogPrimitive.Trigger
				data-slot="dialog-trigger"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<DialogPrimitive.Trigger data-slot="dialog-trigger" {...props}>
			{children}
		</DialogPrimitive.Trigger>
	);
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
	asChild,
	children,
	...props
}: DialogPrimitive.Close.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<DialogPrimitive.Close
				data-slot="dialog-close"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<DialogPrimitive.Close data-slot="dialog-close" {...props}>
			{children}
		</DialogPrimitive.Close>
	);
}

function DialogOverlay({
	className,
	...props
}: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			data-slot="dialog-overlay"
			className={cn(
				"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-[170] bg-black/50 dark:bg-black/80",
				className,
			)}
			{...props}
		/>
	);
}

function DialogCloseButton() {
	return (
		<DialogPrimitive.Close
			data-slot="dialog-close"
			className="absolute top-3 right-3 grid size-6 place-items-center rounded-md text-tertiary-foreground transition-colors duration-150 hover:bg-overlay-hover hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5"
		>
			<XIcon />
			<span className="sr-only">Close</span>
		</DialogPrimitive.Close>
	);
}

const DialogContent = React.forwardRef<
	HTMLDivElement,
	DialogPrimitive.Popup.Props & {
		showCloseButton?: boolean;
	}
>(({ className, children, showCloseButton = true, ...props }, ref) => (
	<DialogPortal data-slot="dialog-portal">
		<DialogOverlay />
		<DialogPrimitive.Popup
			ref={ref}
			data-slot="dialog-content"
			className={cn(
				"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-[0.97] data-open:zoom-in-[0.97] fixed top-[50%] left-[50%] z-[180] grid translate-x-[-50%] translate-y-[-50%] duration-150",
				"w-[calc(100%-2rem)] max-w-[400px] gap-3 rounded-2xl border border-overlay-border bg-overlay-dialog p-4 text-muted-foreground shadow-overlay-dialog",
				className,
			)}
			{...props}
		>
			{children}
			{showCloseButton && <DialogCloseButton />}
		</DialogPrimitive.Popup>
	</DialogPortal>
));
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-header"
			className={cn("flex flex-col gap-0.5 pr-7 text-left", className)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn(
				"flex flex-col-reverse gap-2 pt-1 sm:flex-row *:flex-1",
				className,
			)}
			{...props}
		/>
	);
}

const DialogTitle = React.forwardRef<
	HTMLHeadingElement,
	DialogPrimitive.Title.Props
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		data-slot="dialog-title"
		className={cn(
			"font-semibold text-foreground text-sm leading-[18px] tracking-[-0.01em]",
			className,
		)}
		{...props}
	/>
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
	HTMLParagraphElement,
	DialogPrimitive.Description.Props
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		data-slot="dialog-description"
		className={cn(
			"text-[12.5px] text-tertiary-foreground leading-[18px]",
			className,
		)}
		{...props}
	/>
));
DialogDescription.displayName = "DialogDescription";

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
