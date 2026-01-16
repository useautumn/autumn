import { cn } from "@/lib/utils";

interface SectionTagProps {
	children: React.ReactNode;
	className?: string;
}

export const SectionTag = ({ children, className }: SectionTagProps) => {
	return (
		<div
			className={cn(
				"text-xs text-t3 font-medium px-2 mb-2 bg-muted w-fit rounded-lg py-0.25",
				className,
			)}
		>
			{children}
		</div>
	);
};
