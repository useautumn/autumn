import { Check, Copy } from "lucide-react";
import type React from "react";
import { cloneElement, forwardRef, isValidElement, useState } from "react";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";

export const AdminHover = forwardRef<
	HTMLElement,
	{
		children: React.ReactNode;
		texts: (string | { key: string; value: string } | undefined | null)[];
		hide?: boolean;
		asChild?: boolean;
		side?: "top" | "bottom" | "left" | "right";
	}
>(
	(
		{ children, texts, hide = false, asChild = false, side = "bottom" },
		ref,
	) => {
		const { isAdmin, skipHover } = useAdmin();

		if (!isAdmin || hide || skipHover) return <>{children}</>;

		// Try to forward the ref to the child if possible
		let triggerChild = children;
		if (isValidElement(children)) {
			triggerChild = cloneElement(children as React.ReactElement, { ref });
		}

		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild={asChild}>{triggerChild}</TooltipTrigger>
					{isAdmin && (
						<TooltipContent
							className="bg-white/50 backdrop-blur-sm shadow-sm border px-2 pr-6 py-2 max-w-none z-[9999]"
							align="start"
							side={side}
						>
							<div className="text-xs text-gray-500 flex flex-col gap-2">
								{texts.map((text) => {
									if (!text) return null;
									if (typeof text === "object") {
										return (
											<div key={text.key}>
												<p className="text-xs text-gray-500 font-medium">
													{text.key}
												</p>
												<CopyText text={text.value} />
											</div>
										);
									}
									return <CopyText key={text} text={text} />;
								})}
							</div>
						</TooltipContent>
					)}
				</Tooltip>
			</TooltipProvider>
		);
	},
);

const CopyText = ({ text }: { text: string }) => {
	const [isHover, setIsHover] = useState(false);
	const [isCopied, setIsCopied] = useState(false);

	return (
		<div className="flex items-center gap-1">
			<p
				onMouseEnter={() => setIsHover(true)}
				onMouseLeave={() => setIsHover(false)}
				className="flex flex-col items-start gap-1 font-mono hover:underline"
				onClick={(e) => {
					e.stopPropagation();
					e.preventDefault();
					navigator.clipboard.writeText(text);
					setIsCopied(true);
					setTimeout(() => {
						setIsCopied(false);
					}, 1000);
				}}
			>
				{text?.split("\n").map((line, i) => (
					<span key={i}>{line}</span>
				))}
			</p>
			{isCopied || isHover ? (
				<div
					onClick={() => {
						navigator.clipboard.writeText(text);
						setIsCopied(true);
					}}
				>
					{isCopied ? <Check size={10} /> : <Copy size={10} />}
				</div>
			) : (
				<Check size={10} className="text-transparent" />
			)}
		</div>
	);
};
