import { InfoIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const InfoBox = ({
	classNames,
	children,
	variant = "note",
}: {
	classNames?: {
		infoIcon?: string;
		infoBox?: string;
	};
	children: React.ReactNode;
	variant?: "info" | "warning" | "error" | "note" | "success";
}) => {
	return (
		<div
			className={cn(
				"px-4 py-2 text-t8 flex gap-2 rounded-lg text-sm",
				variant === "note" && "bg-t8/10 text-t8",
				variant === "info" && "bg-t3/10 text-t3",
				variant === "warning" && "bg-yellow-500/10 text-yellow-500",
				variant === "error" && "bg-red-500/10 text-red-500",
				variant === "success" && "bg-green-500/10 text-green-500",
				classNames?.infoBox,
			)}
		>
			<div className={cn("pt-0.25 mr-1", classNames?.infoIcon)}>
				<InfoIcon size={16} className="" weight="fill" />
			</div>
			<span className="whitespace-pre-wrap">{children}</span>
		</div>
	);
};
