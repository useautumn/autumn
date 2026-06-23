import {
	TableContext,
	type TableProps,
} from "@autumn/ui/components/table/table-context";
import type { ReactNode } from "react";

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
