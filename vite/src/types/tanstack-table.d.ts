import type { ColumnSkeletonMeta } from "@/components/general/table/table-row-cells";

declare module "@tanstack/react-table" {
	interface ColumnMeta<TData, TValue> {
		skeleton?: ColumnSkeletonMeta;
	}
}
