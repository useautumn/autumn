import type { ReactNode } from "react";
import type { Row } from "@tanstack/react-table";
import type { ColumnSkeletonMeta } from "@/components/general/table/table-row-cells";

declare module "@tanstack/react-table" {
	interface ColumnMeta<TData, TValue> {
		skeleton?: ColumnSkeletonMeta;
		mobileCard?: "hidden" | "full";
		mobileCardCell?: (row: Row<TData>) => ReactNode;
	}
}
