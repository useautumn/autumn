import { cn } from "@/lib/utils";

export const EmptyState = ({
	text,
	className,
}: {
	text: string | React.ReactNode;
	className?: string;
}) => {
	return (
		<div
			className={cn(
				"flex justify-center items-center py-4 border-dashed border rounded-lg h-13 w-full min-w-0 overflow-hidden px-4",
				className,
			)}
		>
			<span className="text-xs text-t4 truncate">{text}</span>
		</div>
	);
};
