import type * as React from "react";

import { cn } from "@/lib/utils";

function Table({
	className,
	flexibleTableColumns,
	...props
}: React.ComponentProps<"table"> & { flexibleTableColumns?: boolean }) {
	return (
		<div
			data-slot="table-container"
			className={cn("relative max-w-full rounded-sm p-3 h-full", className)}
		>
			<table
				data-slot="table"
				// className="w-full caption-bottom text-sm table-fixed"
				className={cn(
					"w-full caption-bottom text-sm",
					flexibleTableColumns ? "" : "table-fixed",
				)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			// className={cn("[&_tr]:border-b", className)}
			className={cn("[&:hover_tr]:!bg-transparent", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn(
				"border-t bg-zinc-100/50 font-medium [&>tr]:last:border-b-0 dark:bg-zinc-800/50",
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				" data-[state=selected]:bg-zinc-100 dark:hover:bg-zinc-800/50 dark:data-[state=selected]:bg-zinc-800 ",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				"h-6 text-t2 text-left align-middle font-normal text-xs [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] dark:text-zinc-400",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				"text-ellipsis overflow-hidden font-medium whitespace-nowrap py-1 text-t2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<"caption">) {
	return (
		<caption
			data-slot="table-caption"
			className={cn("mt-4 text-sm text-zinc-500 dark:text-zinc-400", className)}
			{...props}
		/>
	);
}

export {
	Table,
	TableHeader,
	TableBody,
	
	TableHead,
	TableRow,
	TableCell,
	
};
