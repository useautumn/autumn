"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface SheetAccordionProps {
	children: React.ReactNode;
	type?: "single" | "multiple";
	defaultValue?: string | string[];
	withSeparator?: boolean;
	collapsible?: boolean;
}

function SheetAccordion({ 
	children, 
	type = "single", 
	defaultValue,
	withSeparator = true,
	collapsible = true,
	...props 
}: SheetAccordionProps & Omit<React.ComponentProps<typeof AccordionPrimitive.Root>, 'type'>) {
	return (
		<>
			<AccordionPrimitive.Root
				type={type as any}
				defaultValue={defaultValue}
				collapsible={collapsible}
				className="w-full"
				{...props}
			>
				{children}
			</AccordionPrimitive.Root>
			{withSeparator && (
				<div className="px-4">
					<Separator />
				</div>
			)}
		</>
	);
}

interface SheetAccordionItemProps {
	value: string;
	title: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
}

function SheetAccordionItem({
	value,
	title,
	description,
	children,
	className,
}: SheetAccordionItemProps) {
	return (
		<AccordionPrimitive.Item
			value={value}
			className={cn("", className)}
		>
			<AccordionPrimitive.Header className="flex">
				<AccordionPrimitive.Trigger className="flex flex-1 items-start justify-between gap-4 px-4 py-3 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180 hover:bg-accent/50">
					<div className="flex flex-col gap-1">
						<h3 className="text-sub font-medium">{title}</h3>
						{description && (
							<p className="text-body-secondary text-sm">{description}</p>
						)}
					</div>
					<ChevronDownIcon className="text-muted-foreground pointer-events-none size-4 shrink-0 translate-y-0.5 transition-transform duration-200" />
				</AccordionPrimitive.Trigger>
			</AccordionPrimitive.Header>
			<AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
				<div className="px-4 pb-4">
					{children}
				</div>
			</AccordionPrimitive.Content>
		</AccordionPrimitive.Item>
	);
}

export { SheetAccordion, SheetAccordionItem };