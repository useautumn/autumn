import type { ReactNode } from "react";
import ErrorScreen from "@/views/general/ErrorScreen";
import { TableContext, type TableProps } from "./table-context";

interface TableProviderProps<T> {
	children: ReactNode;
	config: TableProps<T>;
}

export function TableProvider<T>(props: TableProviderProps<T>) {
	const { children, config } = props;

	if (!config) {
		return (
			<ErrorScreen>
				<span className="text-t2 text-sm">Table config is required</span>
			</ErrorScreen>
		);
	}

	return (
		<TableContext.Provider value={config}>{children}</TableContext.Provider>
	);
}
