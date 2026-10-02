"use client";

import { cn, hasSubmitShortcutModifier } from "@autumn/ui/lib/utils";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { createContext, type ReactNode, useContext } from "react";

const SWITCH_SIZE_CLASSES = {
	default: {
		root: "h-5 w-9",
		thumb: "size-4 data-checked:translate-x-4",
	},
	sm: {
		root: "h-4 w-7",
		thumb: "size-3 data-checked:translate-x-3",
	},
} as const;

type SwitchSize = keyof typeof SWITCH_SIZE_CLASSES;

const SwitchSizeContext = createContext<SwitchSize>("default");

/** Sets the default size for every Switch rendered inside it. */
function SwitchSizeProvider({
	size,
	children,
}: {
	size: SwitchSize;
	children: ReactNode;
}) {
	return (
		<SwitchSizeContext.Provider value={size}>
			{children}
		</SwitchSizeContext.Provider>
	);
}

function Switch({
	className,
	thumbClassName,
	onKeyDown,
	...props
}: SwitchPrimitive.Root.Props & {
	thumbClassName?: string;
}) {
	const sizeClasses = SWITCH_SIZE_CLASSES[useContext(SwitchSizeContext)];

	const handleKeyDown: SwitchPrimitive.Root.Props["onKeyDown"] = (event) => {
		// Stop base-ui's Enter activation so cmd/ctrl+enter only triggers
		// sheet-level submit shortcuts instead of also toggling the switch
		if (event.key === "Enter" && hasSubmitShortcutModifier(event)) {
			event.preventBaseUIHandler();
		}
		onKeyDown?.(event);
	};

	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			onKeyDown={handleKeyDown}
			className={cn(
				"peer data-checked:bg-primary data-unchecked:bg-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex shrink-0 items-center rounded-[3px] border-2 border-transparent transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
				sizeClasses.root,
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					"data-checked:bg-switch-thumb-on data-unchecked:bg-background pointer-events-none block rounded-[2px] ring-0 shadow-[0_1px_2px_rgba(0,0,0,0.45)] transition-transform data-unchecked:translate-x-0",
					sizeClasses.thumb,
					thumbClassName,
				)}
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch, SwitchSizeProvider };
