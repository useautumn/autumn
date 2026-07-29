import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import * as React from "react";

function Collapsible({
	asChild,
	children,
	...props
}: CollapsiblePrimitive.Root.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<CollapsiblePrimitive.Root
				data-slot="collapsible"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<CollapsiblePrimitive.Root data-slot="collapsible" {...props}>
			{children}
		</CollapsiblePrimitive.Root>
	);
}

function CollapsibleTrigger({
	asChild,
	children,
	...props
}: CollapsiblePrimitive.Trigger.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<CollapsiblePrimitive.Trigger
				data-slot="collapsible-trigger"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props}>
			{children}
		</CollapsiblePrimitive.Trigger>
	);
}

function CollapsibleContent({
	asChild,
	children,
	...props
}: CollapsiblePrimitive.Panel.Props & { asChild?: boolean }) {
	if (asChild && React.isValidElement(children)) {
		return (
			<CollapsiblePrimitive.Panel
				data-slot="collapsible-content"
				render={children}
				{...props}
			/>
		);
	}
	return (
		<CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props}>
			{children}
		</CollapsiblePrimitive.Panel>
	);
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
