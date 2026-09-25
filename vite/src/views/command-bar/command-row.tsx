import { CommandItem, CommandShortcut } from "@autumn/ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const getMetaKey = () => (navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl");

interface CommandRowProps {
	icon?: React.ReactNode;
	title: string;
	subtext?: string;
	/** Digit paired with the platform meta key, e.g. "1" renders ⌘1 */
	shortcutKey?: string;
	customShortcuts?: string[];
	onSelect: () => void;
	className?: string;
	value?: string;
}

const getShortcutLabel = ({
	shortcutKey,
	customShortcuts,
}: Pick<CommandRowProps, "shortcutKey" | "customShortcuts">) => {
	if (customShortcuts?.length) return customShortcuts.join("");
	if (shortcutKey) return `${getMetaKey()}${shortcutKey}`;
	return null;
};

export const CommandRow = React.forwardRef<HTMLDivElement, CommandRowProps>(
	(
		{
			icon,
			title,
			subtext,
			shortcutKey,
			customShortcuts,
			onSelect,
			className,
			value,
		},
		ref,
	) => {
		const shortcutLabel = getShortcutLabel({ shortcutKey, customShortcuts });

		return (
			<CommandItem
				ref={ref}
				value={value}
				onSelect={onSelect}
				className={cn("flex items-center justify-between", className)}
			>
				<div className="flex min-w-0 flex-1 items-center gap-2.5">
					{React.isValidElement<
						React.HTMLAttributes<HTMLElement> & { strokeWidth?: number }
					>(icon)
						? React.cloneElement(icon, {
								className: cn(
									"size-4 text-tertiary-foreground",
									icon.props.className,
								),
								strokeWidth: icon.props.strokeWidth ?? 1.5,
							})
						: icon}
					<span className="max-w-[50%] shrink-0 truncate text-sm text-foreground">
						{title}
					</span>
					{subtext && (
						<span className="truncate text-xs text-tertiary-foreground">
							{subtext}
						</span>
					)}
				</div>
				{shortcutLabel && <CommandShortcut>{shortcutLabel}</CommandShortcut>}
			</CommandItem>
		);
	},
);

CommandRow.displayName = "CommandRow";
