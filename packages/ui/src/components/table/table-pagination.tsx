import { useTableContext } from "@autumn/ui/components/table/table-context";
import { TableFooter } from "@autumn/ui/components/table/table-footer";

export function TablePagination() {
	const { table } = useTableContext();
	return <TableFooter table={table} className="mt-4" />;
}
