import { useHotkeys } from "react-hotkeys-hook";
import { Button, type ButtonProps } from "@/components/v2/buttons/Button";

export const ShortcutButton = ({
	metaShortcut,
	singleShortcut,
	children,
	isLoading,
	variant,
	...props
}: {
	metaShortcut?: string;
	singleShortcut?: string;
	children: React.ReactNode;
	isLoading?: boolean;
	variant?: "primary" | "secondary";
} & ButtonProps) => {
	const getMetaKey = () => {
		if (navigator.userAgent.includes("Mac")) {
			return "⌘";
		}
		return "Ctrl";
	};

	useHotkeys(
		metaShortcut
			? [`mod+${metaShortcut}`]
			: singleShortcut
				? [singleShortcut]
				: [],
		(e) => {
			e.preventDefault();
			props?.onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
		},
		{
			enableOnFormTags: true,
		},
	);

	const keystrokeContainer = (keyStroke: string, isEnter = false) => {
		const isSingleChar = keyStroke.length === 1;
		const sizeClasses = isSingleChar ? "w-4" : "px-1";
		const baseClasses = `flex items-center justify-center ${sizeClasses} h-4 rounded-md text-tiny font-medium`;
		const variantClasses =
			variant === "secondary"
				? "bg-muted text-body-secondary"
				: "bg-purple-medium dark:bg-transparent dark:text-t3";

		return (
			<div className={`${baseClasses} ${variantClasses}`}>
				<span
					className={
						isEnter ? "inline-block translate-y-[1px] translate-x-[-0.5px]" : ""
					}
				>
					{keyStroke}
				</span>
			</div>
		);
	};

	const getShortcutDisplay = () => {
		if (metaShortcut) {
			if (metaShortcut === "enter") return "↵";
			if (metaShortcut === "backspace") return "⌫";
			return metaShortcut.toUpperCase();
		}
		if (singleShortcut) {
			if (singleShortcut === "escape") return "Esc";
			return singleShortcut.toUpperCase();
		}
		return "";
	};

	return (
		<Button
			isLoading={isLoading}
			variant={variant}
			{...props}
			className="gap-1 items-center"
		>
			{children}
			{(metaShortcut || singleShortcut) && (
				<span className="flex items-center gap-0.5 dark:gap-0">
					{metaShortcut && keystrokeContainer(getMetaKey())}
					{keystrokeContainer(getShortcutDisplay(), metaShortcut === "enter")}
				</span>
			)}
		</Button>
	);
};
