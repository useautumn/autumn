import type { ReactNode } from "react";
import {
	Table as BaseTable,
	TableProvider as BaseTableProvider,
	type TableProps,
} from "@autumn/ui/table";
import { Link } from "react-router";

// Forward everything from the package table; Table is overridden below to inject Link.
export * from "@autumn/ui/table";

function TableProvider<T>({
	config,
	children,
}: {
	config: TableProps<T>;
	children: ReactNode;
}) {
	return (
		<BaseTableProvider config={{ linkComponent: Link, ...config }}>
			{children}
		</BaseTableProvider>
	);
}

export const Table = {
	...BaseTable,
	Provider: TableProvider,
};
