import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { IconButtonProps } from "./IconButton";
import { IconButton } from "./IconButton";

/** Hook for copy-to-clipboard with auto-reset state */
export const useCopyAnimation = ({
	text,
	timeout = 1500,
}: {
	text: string;
	timeout?: number;
}) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (copied) {
			const timer = setTimeout(() => setCopied(false), timeout);
			return () => clearTimeout(timer);
		}
	}, [copied, timeout]);

	const handleCopy = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			e.preventDefault();
			e.stopPropagation();
			navigator.clipboard.writeText(text);
			setCopied(true);
		},
		[text],
	);

	return { copied, handleCopy };
};

/** Animated icon that transitions between copy and check */
export const AnimatedCopyIcon = ({
	copied,
	size = "size-3.5",
}: {
	copied: boolean;
	size?: string;
}) => (
	<span
		className={cn("relative inline-flex items-center justify-center", size)}
	>
		<CopyIcon
			className={cn(
				size,
				"absolute transition-all duration-100",
				copied ? "opacity-0 scale-95" : "opacity-100 scale-100",
			)}
		/>
		<CheckIcon
			className={cn(
				size,
				"absolute text-green-500 transition-all duration-100",
				copied ? "opacity-100 scale-100" : "opacity-0 scale-95",
			)}
		/>
	</span>
);

interface CopyButtonProps extends IconButtonProps {
	children?: React.ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	text: string;
	iconOrientation?: "left" | "right";
	innerClassName?: string;
}

export const CopyButton = ({
	text,
	side = "right",
	innerClassName = "",
	iconOrientation = "right",
	children,
	...props
}: CopyButtonProps) => {
	const { copied, handleCopy } = useCopyAnimation({ text });

	return (
		<TooltipProvider>
			<Tooltip open={copied} onOpenChange={() => {}}>
				<TooltipTrigger asChild>
					<IconButton
						variant="muted"
						{...props}
						size={"sm"}
						iconOrientation={iconOrientation}
						onClick={handleCopy}
						icon={<AnimatedCopyIcon copied={copied} />}
						className={cn("", props.className)}
					>
						<span className={cn("truncate", innerClassName)}>
							{children ?? text}
						</span>
					</IconButton>
				</TooltipTrigger>
				<TooltipContent
					side={side}
					sideOffset={8}
					className="bg-background text-body p-2 py-1 border rounded-lg shadow-sm z-100"
				>
					<div className="flex items-center gap-1">
						<span className="text-xs font-medium">Copied!</span>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

export const MiniCopyButton = ({
	text,
	side = "right",
	innerClassName = "",
	children,
	...props
}: CopyButtonProps) => {
	const { copied, handleCopy } = useCopyAnimation({ text });

	return (
		<div className="flex items-center gap-1 w-fit max-w-full group text-t3">
			{children}
			<span
				className={cn("text-sm text-tiny-id w-full truncate", innerClassName)}
			>
				{text}
			</span>
			<TooltipProvider>
				<Tooltip open={copied} onOpenChange={() => {}}>
					<TooltipTrigger asChild>
						<IconButton
							variant="skeleton"
							{...props}
							iconOrientation="right"
							icon={<AnimatedCopyIcon copied={copied} />}
							onClick={handleCopy}
							className={cn(
								"opacity-0 group-hover:opacity-100 cursor-pointer px-0!",
								copied && "opacity-100",
							)}
						/>
					</TooltipTrigger>
					<TooltipContent
						side={side}
						sideOffset={8}
						className="bg-background text-body p-2 py-1 border rounded-lg shadow-sm"
					>
						<div className="flex items-center gap-1">
							<span className="text-xs font-medium">Copied!</span>
						</div>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
