import { useTableContext } from "./table-context";
import { TableFooter } from "./table-footer";

export function TablePagination() {
	const { table } = useTableContext();
	return <TableFooter table={table} className="mt-4" />;
}
