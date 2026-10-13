import type { ReactNode } from "react";

export function PlanTrayRow({ children }: { children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5 border-t border-table-row-divider px-2 py-1 transition-opacity duration-150 ease-out first:border-t-0 hover:bg-table-row-hover starting:opacity-0 motion-reduce:transition-none">
			{children}
		</div>
	);
}
