import type { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import * as React from "react";
import { Checkbox } from "@/components/v2/checkboxes/Checkbox";
import { cn, hasSubmitShortcutModifier } from "@/lib/utils";

export const CheckboxButton = React.forwardRef<
	HTMLButtonElement,
	CheckboxPrimitive.Root.Props
>(({ className, onCheckedChange, checked, ...props }, ref) => {
	const handleClick = () => {
		const newChecked = !checked;
		(onCheckedChange as ((checked: boolean) => void) | undefined)?.(newChecked);
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: Checkbox renders as button, so wrapper cannot be button or label
		<span
			role="checkbox"
			aria-checked={!!checked}
			tabIndex={0}
			onClick={handleClick}
			onKeyDown={(e) => {
				// Cmd/ctrl+enter is reserved for sheet-level submit shortcuts
				if (e.key === "Enter" && hasSubmitShortcutModifier(e)) {
					return;
				}
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					handleClick();
				}
			}}
			className={cn(
				"cursor-pointer select-none bg-transparent flex items-center gap-1.5 rounded-lg h-6 pr-1.5 pl-[7px] py-[5px] text-subtle hover:text-foreground text-xs font-medium",
				className,
			)}
		>
			<Checkbox
				checked={checked}
				ref={ref}
				tabIndex={-1}
				onClick={(e) => e.preventDefault()}
				size="sm"
				className="pointer-events-none"
				{...props}
			/>
			{props.children}
		</span>
	);
});
