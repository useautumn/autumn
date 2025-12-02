import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
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
						className={cn("text-t3", props.className)}
					>
						<span className={cn("text-tiny-id truncate", innerClassName)}>
							{text}
						</span>
					</IconButton>
				</TooltipTrigger>
				<TooltipContent
					side={side}
					sideOffset={8}
					className="bg-background text-body p-2 py-1 border rounded-lg shadow-sm z-100"
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

export const MiniCopyButton = ({
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
							icon={<CopyIcon className="size-3.5" />}
							onClick={handleCopy}
							className={cn(
								"[&_svg]:opacity-0 group-hover:[&_svg]:opacity-100 hover:[&_svg]:text-primary cursor-pointer !px-0 active:border-transparent",
							)}
						></IconButton>
					</TooltipTrigger>
					<TooltipContent
						side={side}
						sideOffset={8}
						className="bg-background text-body p-2 py-1 border rounded-lg shadow-sm"
					>
						<div className="flex items-center gap-1">
							<CheckIcon className="size-3 text-green-500" />
							<span className="text-xs font-medium">Copied</span>
						</div>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	);
};
