import { cn } from "@autumn/ui";

interface PageContainerProps {
	children: React.ReactNode;
	className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-4 relative w-full pb-8 max-w-5xl mx-auto pt-4 sm:pt-8 px-4 sm:px-10",
				className,
			)}
		>
			{children}
		</div>
	);
}
