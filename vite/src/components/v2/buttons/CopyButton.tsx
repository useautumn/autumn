import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { IconButtonProps } from "./IconButton";
import { IconButton } from "./IconButton";

interface CopyButtonProps extends IconButtonProps {
	children?: React.ReactNode;
	side?: "top" | "bottom" | "left" | "right";
	text: string;
}

export const CopyButton = ({
	text,
	side = "right",
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
						<span className="text-tiny-id">{text}</span>
					</IconButton>
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
