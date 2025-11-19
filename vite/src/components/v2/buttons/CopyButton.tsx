import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import type { IconButtonProps } from "./IconButton";
import { IconButton } from "./IconButton";

interface CopyButtonProps extends IconButtonProps {
	children?: React.ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	text: string;
	innerClassName?: string;
}

export const CopyButton = ({
	text,
	side = "right",
	innerClassName = "",
	...props
}: CopyButtonProps) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (copied) {
			setTimeout(() => {
				setCopied(false);
			}, 1500); // Show "Copied" message for 2 seconds
		}
	}, [copied]);

	const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		navigator.clipboard.writeText(text);
		setCopied(true);
	};

	return (
		<TooltipProvider>
			<Tooltip open={copied} onOpenChange={() => {}}>
				<TooltipTrigger asChild>
					<IconButton
						variant="muted"
						{...props}
						iconOrientation="right"
						onClick={handleCopy}
						icon={<CopyIcon className="size-3.5" />}
					>
						<span className={cn("text-tiny-id truncate", innerClassName)}>
							{text}
						</span>
					</IconButton>
				</TooltipTrigger>
				<TooltipContent
					side={side}
					sideOffset={8}
					className="bg-background text-body p-2 py-1 border rounded-lg shadow-sm"
				>
					<div className="flex items-center gap-1">
						<CheckIcon className="size-3" />
						<span className="text-xs font-medium">Copied</span>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};

export const CopyButtonSkeleton = ({
	text,
	side = "right",
	innerClassName = "",
	children,
	className = "",
	...props
}: CopyButtonProps) => {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (copied) {
			setTimeout(() => {
				setCopied(false);
			}, 1500); // Show "Copied" message for 2 seconds
		}
	}, [copied]);

	const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		navigator.clipboard.writeText(text);
		setCopied(true);
	};

	return (
		<TooltipProvider>
			<Tooltip open={copied} onOpenChange={() => {}}>
				<TooltipTrigger asChild>
					<Button
						variant="skeleton"
						{...props}
						onClick={handleCopy}
						className={cn(
							"!px-0 hover:bg-transparent hover:text-primary active:bg-transparent active:border-transparent text-t4 gap-1.5",
							className,
						)}
					>
						{children}
						<span className={cn("text-sm hover:text-primary", innerClassName)}>
							{text}
						</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent
					side={side}
					sideOffset={8}
					className="bg-white text-body p-2 py-1 border rounded-lg shadow-sm"
				>
					<div className="flex items-center gap-1">
						<CheckIcon className="size-3" />
						<span className="text-xs font-medium">Copied</span>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
