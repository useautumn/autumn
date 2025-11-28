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
				"bg-t8/10 px-4 py-2 text-t8 flex gap-2 rounded-lg text-sm",
				classNames?.infoBox,
			)}
		>
			<div className={cn("pt-0.5 mr-1", classNames?.infoIcon)}>
				<InfoIcon size={16} className="text-t8" weight="fill" />
			</div>
			<span className="whitespace-pre-wrap">{children}</span>
		</div>
	);
};
