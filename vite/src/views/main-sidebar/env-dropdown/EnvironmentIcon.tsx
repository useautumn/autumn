import { FlaskConical, Sailboat } from "lucide-react";
import { PhosphorIcon } from "@/components/v2/icons/PhosphorIcon";
import { sandboxColorClass } from "@/hooks/sandbox/sandboxDisplay";
import { cn } from "@/lib/utils";

export const EnvironmentIcon = ({
	isLive = false,
	sandbox,
	className,
}: {
	isLive?: boolean;
	sandbox?: { icon?: string; color?: string } | null;
	className?: string;
}) => {
	if (isLive) {
		return (
			<Sailboat
				className={cn("size-4 shrink-0 text-primary", className)}
				strokeWidth={1.75}
			/>
		);
	}
	if (sandbox?.icon) {
		return (
			<PhosphorIcon
				name={sandbox.icon}
				className={cn(
					"size-4 shrink-0",
					sandboxColorClass(sandbox.color),
					className,
				)}
			/>
		);
	}
	return (
		<FlaskConical
			className={cn("size-4 shrink-0 text-sandbox", className)}
			strokeWidth={1.75}
		/>
	);
};
