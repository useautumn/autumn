import { Button, type ButtonProps } from "@autumn/ui";
import { Check, Copy } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function CopyButton({
	text,
	className,
	children,
	copySize,
	variant = "secondary",
	icon,
}: {
	text: string;
	className?: string;
	children?: React.ReactNode;
	copySize?: number;
	variant?: string;
	icon?: React.ReactNode;
}) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		setTimeout(() => {
			setCopied(false);
		}, 1000);
	}, [copied]);

	return (
		<Button
			variant={variant as ButtonProps["variant"]}
			size="icon"
			className={cn(
				"h-6 px-2 text-muted-foreground w-fit font-mono rounded-md truncate justify-start",
				className,
			)}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				navigator.clipboard.writeText(text);
				setCopied(true);
			}}
		>
			{children && <span className="truncate block">{children}</span>}
			<div className="flex items-center justify-center">
				{copied ? (
					<Check size={copySize || 13} className="text-foreground" />
				) : (
					<Copy size={copySize || 13} />
				)}
			</div>
		</Button>
	);
}

export default CopyButton;
