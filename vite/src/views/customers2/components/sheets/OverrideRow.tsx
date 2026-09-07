import type { ReactNode } from "react";

export function OverrideRow({
	label,
	value,
}: {
	label: ReactNode;
	value: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between text-sm px-2 py-0.5 rounded-md">
			<span className="text-foreground font-medium">{label}</span>
			<span className="text-tertiary-foreground text-xs">{value}</span>
		</div>
	);
}
