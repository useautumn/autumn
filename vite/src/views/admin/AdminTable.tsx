import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useState } from "react";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { DataTable } from "./DataTable";

export const AdminTable = ({
	path,
	columns,
	title,
}: {
	path: string;
	columns: ColumnDef<any, any>[];
	title: string;
}) => {
	const [search, setSearch] = useState("");
	const [after, setAfter] = useState<string | undefined>(undefined);
	const [before, setBefore] = useState<string | undefined>(undefined);
	const [sortKey, setSortKey] = useState("createdAt");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	const [page, setPage] = useState(1);

	// Build query string for params
	const params = new URLSearchParams();
	if (search) params.append("search", search);
	if (after) params.append("after", after);
	if (before) params.append("before", before);
	if (sortKey) params.append("sortKey", sortKey);
	if (sortOrder) params.append("sortOrder", sortOrder);
	const url = `${path}${params.toString() ? `?${params.toString()}` : ""}`;

	const { data, isLoading } = useAxiosSWR({
		url,
	});

	const rows = data?.rows || [];

	const pageInfo = {
		hasNextPage: data?.hasNextPage || false,
		hasPrevPage: rows.length !== 0,
		lastItem: `${rows[rows.length - 1]?.id},${rows[rows.length - 1]?.createdAt}`,
		firstItem: `${rows[0]?.id},${rows[0]?.createdAt}`,
		page,
	};

	const handleSearch = useCallback((value: string) => {
		setSearch(value);
		setAfter(undefined);
		setBefore(undefined);
		setPage(1);
	}, []);

	const handlePaginate = useCallback(
		(direction: "next" | "prev") => {
			if (direction === "next") {
				setAfter(pageInfo.lastItem);
				setBefore(undefined);
			} else {
				setBefore(pageInfo.firstItem);
				setAfter(undefined);
			}
			setPage((p) => (direction === "next" ? p + 1 : Math.max(1, p - 1)));
		},
		[pageInfo],
	);

	const handleSort = useCallback((key: string, order: "asc" | "desc") => {
		setSortKey(key);
		setSortOrder(order);
		setAfter(undefined);
		setBefore(undefined);
		setPage(1);
	}, []);

	return (
		<div>
			<p className="text-sm">{title}</p>
			<DataTable<any, any>
				columns={columns}
				data={rows}
				isLoading={isLoading}
				pageInfo={pageInfo}
				onSearch={handleSearch}
				onPaginate={handlePaginate}
				onSort={handleSort}
				sortKey={sortKey}
				sortOrder={sortOrder}
			/>
		</div>
	);
};
