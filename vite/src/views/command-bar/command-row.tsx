import * as React from "react";
import { CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

/**
 * Get the platform-specific meta key symbol
 */
const getMetaKey = () => {
	if (navigator.userAgent.includes("Mac")) {
		return "⌘";
	}
	return "Ctrl";
};

/**
 * Render a keyboard shortcut key
 */
const KeystrokeContainer = ({ keyStroke }: { keyStroke: string }) => {
	return (
		<div className="flex items-center justify-center size-4 rounded-md text-tiny font-medium bg-muted text-body-secondary border">
			<span>{keyStroke}</span>
		</div>
	);
};

export interface CommandRowProps {
	/** Icon to display (React node) */
	icon?: React.ReactNode;
	/** Main title text */
	title: string;
	/** Optional subtext to display next to title */
	subtext?: string;
	/** Keyboard shortcut number (1-9). Will automatically prepend meta key */
	shortcutKey?: string;
	/** Custom keyboard shortcuts (for complex combinations) */
	customShortcuts?: string[];
	/** Click handler */
	onSelect: () => void;
	/** Additional className for the CommandItem */
	className?: string;
}

/**
 * Consistent command row component for command palette
 */
export const CommandRow = React.forwardRef<HTMLDivElement, CommandRowProps>(
	(
		{ icon, title, subtext, shortcutKey, customShortcuts, onSelect, className },
		ref,
	) => {
		const renderIcon = (icon: React.ReactNode) => {
			if (!icon) return null;

			// Clone the icon and add consistent sizing and lighter stroke weight
			if (React.isValidElement(icon)) {
				return React.cloneElement(icon, {
					className: cn("mr-1 size-3.5 text-t3", icon.props.className),
					strokeWidth: icon.props.strokeWidth ?? 1.5,
				} as React.HTMLAttributes<HTMLElement>);
			}

			return icon;
		};

		const renderShortcuts = () => {
			// Custom shortcuts take precedence
			if (customShortcuts && customShortcuts.length > 0) {
				return (
					<span className="flex items-center gap-0.5">
						{customShortcuts.map((key, index) => (
							<KeystrokeContainer key={index} keyStroke={key} />
						))}
					</span>
				);
			}

			// Standard meta+number shortcut
			if (shortcutKey) {
				return (
					<span className="flex items-center gap-0.5">
						<KeystrokeContainer keyStroke={getMetaKey()} />
						<KeystrokeContainer keyStroke={shortcutKey} />
					</span>
				);
			}

			return null;
		};

		return (
			<CommandItem
				ref={ref}
				onSelect={onSelect}
				className={cn(
					"text-body h-8 flex justify-between items-center px-2 rounded-lg",
					className,
				)}
			>
				<div className="flex items-center gap-2 min-w-0 flex-1">
					{renderIcon(icon)}
					<span className="text-body truncate shrink-0 max-w-[50%]">{title}</span>
					{subtext && <span className="text-tiny truncate text-t3">{subtext}</span>}
				</div>
				{renderShortcuts()}
			</CommandItem>
		);
	},
);

CommandRow.displayName = "CommandRow";
