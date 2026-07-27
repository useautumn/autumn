"use client";

import { cn } from "@autumn/ui/lib/utils";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import * as React from "react";

function Tabs({ ...props }: TabsPrimitive.Root.Props) {
	return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

const TabsList = React.forwardRef<HTMLDivElement, TabsPrimitive.List.Props>(
	({ className, ...props }, ref) => (
		<TabsPrimitive.List
			ref={ref}
			className={cn(
				"inline-flex h-9 items-center justify-center rounded-lg bg-transparent text-mauve-11 dark:bg-mauve-3 dark:text-mauve-10 px-1",
				className,
			)}
			{...props}
		/>
	),
);
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
	HTMLButtonElement,
	TabsPrimitive.Tab.Props & {
		variant?: "default" | "onboarding";
	}
>(({ className, variant = "default", ...props }, ref) => (
	<TabsPrimitive.Tab
		ref={ref}
		className={cn(
			"inline-flex items-center justify-center whitespace-nowrap rounded-lg px-2 py-1 text-sm font-medium ring-offset-background transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-8 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[active]:text-primary hover:bg-interactive-secondary-hover dark:focus-visible:ring-violet-8 dark:data-[active]:bg-mauve-12 dark:data-[active]:text-mauve-1",
			className,
			variant === "onboarding" &&
				"data-[active]:bg-stone-200 data-[active]:text-muted-foreground data-[active]:font-medium",
		)}
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
