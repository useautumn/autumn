import { useHotkeys } from "react-hotkeys-hook";
import { Button, type ButtonProps } from "@/components/v2/buttons/Button";

export const ShortcutButton = ({
	metaShortcut,
	children,
	isLoading,
	...props
}: {
	metaShortcut: string;
	children: React.ReactNode;
	isLoading?: boolean;
} & ButtonProps) => {
	const getMetaKey = () => {
		if (navigator.userAgent.includes("Mac")) {
			return "⌘";
		}
		return "Ctrl";
	};

	useHotkeys([`meta+${metaShortcut}`], (e) => {
		e.preventDefault();
		props?.onClick?.(e as unknown as React.MouseEvent<HTMLButtonElement>);
	});

	const keystrokeContainer = (keyStroke: string) => (
		<div className="bg-[#B07AFF] text-primary-foreground flex items-center justify-center size-4 rounded-md">
			{keyStroke}
		</div>
	);

	return (
		<Button isLoading={isLoading} {...props}>
			{children}
			{metaShortcut && (
				<span className="flex items-center gap-0.5">
					{keystrokeContainer(getMetaKey())} +{" "}
					{keystrokeContainer(metaShortcut.toUpperCase())}
				</span>
			)}
		</Button>
	);
};
