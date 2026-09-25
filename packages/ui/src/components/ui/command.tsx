import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui/components/ui/dialog";
import { cn } from "@autumn/ui/lib/utils";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Command as CommandPrimitive } from "cmdk";
import type * as React from "react";

function Command({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			data-slot="command"
			className={cn(
				"bg-interactive-secondary text-muted-foreground flex h-full w-full flex-col overflow-hidden rounded-lg",
				className,
			)}
			{...props}
		/>
	);
}

// Palette-only sizing, applied through data-slots so inline pickers keep their compact rows.
const COMMAND_DIALOG_SLOT_STYLES = [
	"[&_[data-slot=command-input-wrapper]]:h-13 [&_[data-slot=command-input-wrapper]]:shrink-0 [&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:px-4",
	"[&_[data-slot=command-input]]:text-md",
	"[&_[data-slot=command-list]]:max-h-[360px] [&_[data-slot=command-list]]:min-h-0 [&_[data-slot=command-list]]:flex-1",
	"[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-tertiary-foreground",
	"[&_[data-slot=command-item]]:h-9 [&_[data-slot=command-item]]:gap-2.5 [&_[data-slot=command-item]]:rounded-lg [&_[data-slot=command-item]]:px-2.5",
	"[&_[data-slot=command-item][data-selected=true]]:bg-foreground/6",
];

function CommandDialog({
	title = "Command Palette",
	description = "Search for a command to run...",
	children,
	className,
	showCloseButton = false,
	...props
}: React.ComponentProps<typeof Dialog> & {
	title?: string;
	description?: string;
	className?: string;
	showCloseButton?: boolean;
	children?: React.ReactNode;
}) {
	return (
		<Dialog {...props}>
			<DialogHeader className="sr-only">
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
			</DialogHeader>
			<DialogContent
				className={cn(
					"top-[18%] flex max-h-[calc(82dvh-1rem)] max-w-[640px] translate-y-0 flex-col gap-0 overflow-hidden rounded-xl bg-interactive-secondary p-0 shadow-2xl ring-foreground/8",
					className,
				)}
				overlayClassName="dark:bg-black/60"
				showCloseButton={showCloseButton}
			>
				<Command
					shouldFilter={false}
					className={cn("min-h-0 rounded-none", COMMAND_DIALOG_SLOT_STYLES)}
				>
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
}

function CommandInput({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div
			data-slot="command-input-wrapper"
			className="flex h-10 items-center gap-2 border-b border-border px-3"
		>
			<MagnifyingGlassIcon className="size-4 shrink-0 text-tertiary-foreground" />
			<CommandPrimitive.Input
				data-slot="command-input"
				className={cn(
					"placeholder:text-muted-foreground flex h-full w-full bg-transparent text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function CommandList({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			data-slot="command-list"
			className={cn(
				"max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
				className,
			)}
			{...props}
		/>
	);
}

function CommandEmpty({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
	return (
		<CommandPrimitive.Empty
			data-slot="command-empty"
			className={cn("py-6 text-center text-sm", className)}
			{...props}
		/>
	);
}

function CommandGroup({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			data-slot="command-group"
			className={cn(
				"text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
				"!p-1",
				className,
			)}
			{...props}
		/>
	);
}

function CommandSeparator({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
	return (
		<CommandPrimitive.Separator
			data-slot="command-separator"
			className={cn("bg-border -mx-1 h-px", className)}
			{...props}
		/>
	);
}

function CommandItem({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			className={cn(
				"data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

function CommandShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="command-shortcut"
			className={cn(
				"ml-auto shrink-0 text-xs text-tertiary-foreground tabular-nums",
				className,
			)}
			{...props}
		/>
	);
}

function CommandKbd({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="command-kbd"
			className={cn(
				"flex h-5 min-w-5 items-center justify-center rounded-[5px] bg-foreground/5 px-1 font-sans text-[11px] text-tertiary-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function CommandFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="command-footer"
			className={cn(
				"flex h-10 shrink-0 items-center justify-between border-t border-border bg-foreground/2 px-3.5",
				className,
			)}
			{...props}
		/>
	);
}

function CommandHint({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="command-hint"
			className={cn(
				"flex items-center gap-1 text-xs text-tertiary-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Command,
	CommandFooter,
	CommandHint,
	CommandKbd,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
};
