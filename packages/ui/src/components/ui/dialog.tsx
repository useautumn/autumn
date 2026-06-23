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
				"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 fixed top-[50%] left-[50%] z-[180] grid translate-x-[-50%] translate-y-[-50%] rounded-lg shadow-lg ring-1 ring-foreground/10 duration-200",
				"w-full max-w-md gap-3 bg-background",
				"p-4",
				className,
			)}
			{...props}
		>
			{children}
			{showCloseButton && (
				<DialogPrimitive.Close
					data-slot="dialog-close"
					className="ring-offset-background focus:ring-ring data-open:bg-accent data-open:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
				>
					<XIcon />
					<span className="sr-only">Close</span>
				</DialogPrimitive.Close>
			)}
		</DialogPrimitive.Popup>
	</DialogPortal>
));
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-header"
			className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
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
		className={cn("text-lg leading-none font-semibold", className)}
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
		className={cn("text-muted-foreground text-sm", className)}
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
