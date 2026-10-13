"use client";

import { cn } from "@autumn/ui/lib/utils";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const TRIGGER_BASE =
	"inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 py-1 text-sm font-medium ring-offset-background transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[active]:text-primary hover:bg-interactive-secondary-hover dark:focus-visible:ring-zinc-300 dark:data-[active]:bg-zinc-950 dark:data-[active]:text-zinc-50";

const tabsListVariants = cva("", {
	variants: {
		variant: {
			default:
				"inline-flex h-9 items-center justify-center rounded-lg bg-transparent text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 px-1",
			underline: "flex w-full items-center gap-5 border-b border-border",
		},
	},
	defaultVariants: { variant: "default" },
});

const tabsTriggerVariants = cva("", {
	variants: {
		variant: {
			default: TRIGGER_BASE,
			onboarding: cn(
				TRIGGER_BASE,
				"data-[active]:bg-stone-200 data-[active]:text-muted-foreground data-[active]:font-medium",
			),
			underline:
				"-mb-px inline-flex items-center whitespace-nowrap border-b-2 border-transparent pb-2 text-sm font-medium text-tertiary-foreground outline-none transition-colors cursor-pointer hover:text-foreground focus-visible:text-foreground data-[active]:border-foreground data-[active]:text-foreground",
		},
	},
	defaultVariants: { variant: "default" },
});

function Tabs({ ...props }: TabsPrimitive.Root.Props) {
	return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

const TabsList = React.forwardRef<
	HTMLDivElement,
	TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>
>(({ className, variant, ...props }, ref) => (
	<TabsPrimitive.List
		ref={ref}
		className={cn(tabsListVariants({ variant }), className)}
		{...props}
	/>
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
	HTMLButtonElement,
	TabsPrimitive.Tab.Props & VariantProps<typeof tabsTriggerVariants>
>(({ className, variant, ...props }, ref) => (
	<TabsPrimitive.Tab
		ref={ref}
		className={cn(tabsTriggerVariants({ variant }), className)}
		{...props}
	/>
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<HTMLDivElement, TabsPrimitive.Panel.Props>(
	({ className, ...props }, ref) => (
		<TabsPrimitive.Panel
			ref={ref}
			className={cn(
				"mt-2 mb-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				className,
			)}
			{...props}
		/>
	),
);
TabsContent.displayName = "TabsContent";

export { Tabs, TabsContent, TabsList, TabsTrigger };
