import { useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/v2/buttons/Button";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { type AdminUser, createAdminUserColumns } from "./AdminUserColumns";
import { useAdminTable } from "./hooks/useAdminTable";

export const AdminUserTable = () => {
	const [search, setSearch] = useState("");
	const [after, setAfter] = useState<string | undefined>(undefined);
	const [before, setBefore] = useState<string | undefined>(undefined);
	const [page, setPage] = useState(1);

	// Build query string for params
	const params = new URLSearchParams();
	if (search) params.append("search", search);
	if (after) params.append("after", after);
	if (before) params.append("before", before);
	const url = `/admin/users${params.toString() ? `?${params.toString()}` : ""}`;

	const { data, isLoading } = useAxiosSWR({
		url,
	});

	const rows: AdminUser[] = useMemo(() => data?.rows || [], [data?.rows]);

	const lastRow = rows[rows.length - 1];
	const firstRow = rows[0];

	const pageInfo = {
		hasNextPage: data?.hasNextPage || false,
		hasPrevPage: rows.length !== 0 && page > 1,
		lastItem: lastRow ? `${lastRow.id},${lastRow.createdAt}` : undefined,
		firstItem: firstRow ? `${firstRow.id},${firstRow.createdAt}` : undefined,
		page,
	};

	const handleSearch = (value: string) => {
		setSearch(value);
		setAfter(undefined);
		setBefore(undefined);
		setPage(1);
	};

	const handlePaginate = (direction: "next" | "prev") => {
		if (direction === "next") {
			setAfter(pageInfo.lastItem);
			setBefore(undefined);
		} else {
			setBefore(pageInfo.firstItem);
			setAfter(undefined);
		}
		setPage((p) => (direction === "next" ? p + 1 : Math.max(1, p - 1)));
	};

	const columns = useMemo(() => createAdminUserColumns(), []);

	const table = useAdminTable({
		data: rows,
		columns,
	});

	const enableSorting = false;

	const tableConfig = useMemo(
		() => ({
			table,
			numberOfColumns: columns.length,
			enableSorting,
			isLoading,
			emptyStateText: "No users found.",
			rowClassName: "h-10",
			flexibleTableColumns: true,
		}),
		[table, columns.length, enableSorting, isLoading],
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-medium">Users</h2>
			</div>

			<div className="flex items-center gap-2">
				<Input
					placeholder="Search users..."
					value={search}
					onChange={(e) => handleSearch(e.target.value)}
					className="max-w-sm"
				/>
			</div>

			<Table.Provider config={tableConfig}>
				<Table.Container>
					<Table.Content className="w-fit">
						<Table.Header />
						<Table.Body />
					</Table.Content>
				</Table.Container>
			</Table.Provider>

			<div className="flex items-center justify-end space-x-2">
				<Button
					variant="secondary"
					size="sm"
					onClick={() => handlePaginate("prev")}
					disabled={!pageInfo.hasPrevPage}
				>
					Previous
				</Button>
				<span className="text-sm text-t3">Page {pageInfo.page}</span>
				<Button
					variant="secondary"
					size="sm"
					onClick={() => handlePaginate("next")}
					disabled={!pageInfo.hasNextPage}
				>
					Next
				</Button>
			</div>
		</div>
	);
};
