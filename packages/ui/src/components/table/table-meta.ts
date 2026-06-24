import type { ColumnSkeletonMeta } from "@autumn/ui/components/table/table-row-cells";
import type { Row } from "@tanstack/react-table";
import type { ReactNode } from "react";

declare module "@tanstack/react-table" {
	interface ColumnMeta<TData, TValue> {
		skeleton?: ColumnSkeletonMeta;
		mobileCard?: "hidden" | "full";
		mobileCardCell?: (row: Row<TData>) => ReactNode;
	}
}
