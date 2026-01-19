import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/v2/buttons/Button";
import { Table } from "@/components/general/table";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { type AdminOrg, createAdminOrgColumns } from "./AdminOrgColumns";
import { useAdminTable } from "./hooks/useAdminTable";

export const AdminOrgTable = () => {
	const [search, setSearch] = useState("");
	const [after, setAfter] = useState<string | undefined>(undefined);
	const [before, setBefore] = useState<string | undefined>(undefined);
	const [page, setPage] = useState(1);

	// Build query string for params
	const params = new URLSearchParams();
	if (search) params.append("search", search);
	if (after) params.append("after", after);
	if (before) params.append("before", before);
	const url = `/admin/orgs${params.toString() ? `?${params.toString()}` : ""}`;

	const { data, isLoading } = useAxiosSWR({
		url,
	});

	const rows: AdminOrg[] = data?.rows || [];

	const pageInfo = {
		hasNextPage: data?.hasNextPage || false,
		hasPrevPage: rows.length !== 0 && page > 1,
		lastItem: `${rows[rows.length - 1]?.id},${rows[rows.length - 1]?.createdAt}`,
		firstItem: `${rows[0]?.id},${rows[0]?.createdAt}`,
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

	const columns = useMemo(() => createAdminOrgColumns(), []);

	const table = useAdminTable({
		data: rows,
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const enableSorting = false;

	return (
		<div className="space-y-4 flex-1">
			<div className="flex items-center justify-between">
				<h2 className="text-sm font-medium">Organizations</h2>
			</div>

			<div className="flex items-center gap-2">
				<Input
					placeholder="Search organizations..."
					value={search}
					onChange={(e) => handleSearch(e.target.value)}
					className="max-w-sm"
				/>
			</div>

			<Table.Provider
				config={{
					table,
					numberOfColumns: columns.length,
					enableSorting,
					isLoading,
					emptyStateText: "No organizations found.",
					rowClassName: "h-10",
					flexibleTableColumns: true,
				}}
			>
				<Table.Container>
					<Table.Content className="w-full">
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
