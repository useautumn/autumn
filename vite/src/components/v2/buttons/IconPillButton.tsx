import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IconPillButtonProps {
	icon: LucideIcon;
	text: string;
	onClick?: () => void;
	className?: string;
	disabled?: boolean;
	variant?: "default" | "muted";
}

export const IconPillButton = ({
	icon: Icon,
	text,
	onClick,
	className,
	disabled = false,
	variant = "default",
}: IconPillButtonProps) => {
	return (
		<Button
			variant="outline"
			size="sm"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"inline-flex items-center gap-2 rounded-full px-3 py-1 h-8",
				"bg-background border border-border",
				"hover:bg-muted/50 transition-colors",
				variant === "muted" && "text-muted-foreground",
				className,
			)}
		>
			<Icon size={16} className="flex-shrink-0" />
			<span className="text-sm font-medium whitespace-nowrap">{text}</span>
		</Button>
	);
};
