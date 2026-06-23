import type { ReactNode } from "react";
import { TableContext, type TableProps } from "./table-context";

interface TableProviderProps<T> {
	children: ReactNode;
	config: TableProps<T>;
}

export function TableProvider<T>(props: TableProviderProps<T>) {
	const { children, config } = props;

	if (!config) {
		return (
			<div className="text-muted-foreground text-sm">
				Table config is required
			</div>
		);
	}

	return (
		<TableContext.Provider value={config}>{children}</TableContext.Provider>
	);
}
