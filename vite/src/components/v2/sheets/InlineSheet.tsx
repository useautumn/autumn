import { cn } from "@/lib/utils";

interface SheetContainerProps {
	children: React.ReactNode;
	className?: string;
}

export function SheetContainer({ children, className }: SheetContainerProps) {
	return (
		<div
			className={cn(
				"flex flex-col overflow-y-auto [scrollbar-gutter:stable] border-border-table",
				className,
			)}
		>
			{children}
		</div>
	);
}

// Re-export shared components for backwards compatibility
export {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "./SharedSheetComponents";
