import { cn } from "@/lib/utils";

export const WarningBox = ({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) => {
	return (
		<div
			className={cn(
				"rounded-lg px-2 py-1 bg-yellow-50 border border-yellow-600 text-yellow-600 text-xs min-h-8 flex items-center",
				className,
			)}
		>
			{children}
		</div>
	);
};
