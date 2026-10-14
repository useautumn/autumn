import { cn } from "@/lib/utils";

interface SheetContainerProps {
	children: React.ReactNode;
	className?: string;
}

export function SheetContainer({ children, className }: SheetContainerProps) {
	return (
		<div className={cn("flex flex-col overflow-hidden", className)}>
			{children}
		</div>
	);
}

export {
	SheetHeader,
	SheetSection,
} from "./SharedSheetComponents";
