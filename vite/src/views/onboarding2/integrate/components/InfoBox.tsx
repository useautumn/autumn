import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const InfoBox = ({
	classNames,
	children,
}: {
	classNames?: {
		infoIcon?: string;
		infoBox?: string;
	};
	children: React.ReactNode;
}) => {
	return (
		<div
			className={cn(
				"bg-stone-100 border p-4 text-t2 flex gap-2",
				classNames?.infoBox,
			)}
		>
			<div className={cn("pt-0.5 mr-1", classNames?.infoIcon)}>
				<Info size={14} />
			</div>
			{children}
		</div>
	);
};
