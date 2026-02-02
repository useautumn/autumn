import { cn } from "@/lib/utils";

interface InfoRowProps {
	icon?: React.ReactNode;
	label: string;
	value: string | number | React.ReactNode;
	className?: string;
	mono?: boolean;
}

export function InfoRow({ icon, label, value, className, mono }: InfoRowProps) {
	const isReactNode =
		typeof value !== "string" && typeof value !== "number" && value !== null;

	return (
		<div className="flex items-center gap-2 min-w-0 overflow-hidden">
			{icon && <div className="text-t4/60 shrink-0">{icon}</div>}
			<div className="flex min-w-0 items-center overflow-hidden">
				<div className="text-t3 text-sm font-medium w-20 whitespace-nowrap">
					{label}
				</div>
				{isReactNode ? (
					<div className={cn("text-t1 text-sm wrap-break-word", className)}>
						{value}
					</div>
				) : (
					<div
						className={cn(
							"text-t1 text-sm wrap-break-word",
							mono && "font-mono text-xs",
							className,
						)}
					>
						{value}
					</div>
				)}
			</div>
		</div>
	);
}
