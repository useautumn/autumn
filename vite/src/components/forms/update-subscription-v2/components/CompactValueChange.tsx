import { cn } from "@/lib/utils";

interface CompactValueChangeProps {
	oldValue: string | number | null;
	newValue: string | number | null;
	isUpgrade?: boolean;
}

export function CompactValueChange({
	oldValue,
	newValue,
	isUpgrade = true,
}: CompactValueChangeProps) {
	return (
		<span className="text-xs flex items-center gap-1">
			<span className={cn(isUpgrade ? "text-red-500" : "text-green-500")}>
				{oldValue}
			</span>
			<span className="text-t3">→</span>
			<span className={cn(isUpgrade ? "text-green-500" : "text-red-500")}>
				{newValue}
			</span>
		</span>
	);
}
