import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";

const Accordion: typeof AccordionPrimitive.Root = AccordionPrimitive.Root;

type AccordionItemRef = React.ElementRef<typeof AccordionPrimitive.Item>;
type AccordionItemProps = React.ComponentPropsWithoutRef<
	typeof AccordionPrimitive.Item
>;

const AccordionItem: React.ForwardRefExoticComponent<
	AccordionItemProps & React.RefAttributes<AccordionItemRef>
> = React.forwardRef<AccordionItemRef, AccordionItemProps>(
	({ className, ...props }, ref) => (
		<AccordionPrimitive.Item
			ref={ref}
			className={cn("au-border-b", className)}
			{...props}
		/>
	),
);
AccordionItem.displayName = "AccordionItem";

type AccordionTriggerRef = React.ElementRef<typeof AccordionPrimitive.Trigger>;
type AccordionTriggerProps = React.ComponentPropsWithoutRef<
	typeof AccordionPrimitive.Trigger
>;

const AccordionTrigger: React.ForwardRefExoticComponent<
	AccordionTriggerProps & React.RefAttributes<AccordionTriggerRef>
> = React.forwardRef<AccordionTriggerRef, AccordionTriggerProps>(
	({ className, children, ...props }, ref) => (
		<AccordionPrimitive.Header className="au-flex">
			<AccordionPrimitive.Trigger
				ref={ref}
				className={cn(
					"au-flex au-flex-1 au-items-center au-justify-between au-py-4 au-text-sm au-font-medium au-transition-all hover:au-underline au-text-left [&[data-state=open]>svg]:au-rotate-180",
					className,
				)}
				{...props}
			>
				{children}
				<ChevronDown className="au-h-4 au-w-4 au-shrink-0 au-text-muted-foreground au-transition-transform au-duration-200" />
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	),
);
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName;

type AccordionContentRef = React.ElementRef<typeof AccordionPrimitive.Content>;
type AccordionContentProps = React.ComponentPropsWithoutRef<
	typeof AccordionPrimitive.Content
>;

const AccordionContent: React.ForwardRefExoticComponent<
	AccordionContentProps & React.RefAttributes<AccordionContentRef>
> = React.forwardRef<AccordionContentRef, AccordionContentProps>(
	({ className, children, ...props }, ref) => (
		<AccordionPrimitive.Content
			ref={ref}
			className="au-overflow-hidden au-text-sm data-[state=closed]:au-animate-accordion-up data-[state=open]:au-animate-accordion-down"
			{...props}
		>
			<div className={cn("au-pb-4 au-pt-0", className)}>{children}</div>
		</AccordionPrimitive.Content>
	),
);
AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
