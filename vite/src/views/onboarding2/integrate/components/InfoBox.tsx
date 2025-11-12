import { InfoIcon } from "@phosphor-icons/react";
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
				"bg-t8/10 p-4 text-t8 flex gap-2 rounded-lg",
				classNames?.infoBox,
			)}
		>
			<div className={cn("pt-0.5 mr-1", classNames?.infoIcon)}>
				<InfoIcon size={16} className="text-t8" weight="fill" />
			</div>
			{children}
		</div>
	);
};
