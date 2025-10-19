import { cn } from "@/lib/utils";

export const CodeSpan = ({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) => {
	return (
		<span
			className={cn(
				"bg-stone-200 font-mono text-t2 px-1 py-0.5 rounded-md",
				className,
			)}
		>
			{children}
		</span>
	);
};
