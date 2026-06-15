"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";

import { cn, hasSubmitShortcutModifier } from "@/lib/utils";

function Switch({
	className,
	thumbClassName,
	onKeyDown,
	...props
}: SwitchPrimitive.Root.Props & {
	thumbClassName?: string;
}) {
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
				"peer data-checked:bg-primary data-unchecked:bg-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					"bg-background pointer-events-none block size-4 rounded-full ring-0 shadow-lg transition-transform data-checked:translate-x-4 data-unchecked:translate-x-0",
					thumbClassName,
				)}
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
