import type { ApiKey } from "@autumn/shared";
import { useMemo } from "react";
import { Table } from "@/components/general/table";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { createAPIKeyTableColumns } from "./APIKeyTableColumns";

export const APIKeyTable = ({ apiKeys }: { apiKeys: ApiKey[] }) => {
	const columns = useMemo(() => createAPIKeyTableColumns(), []);

	const apiKeyTable = useProductTable({
		data: apiKeys || [],
		columns,
		options: {
			globalFilterFn: "includesString",
			enableGlobalFilter: true,
		},
	});

	const enableSorting = false;

	const emptyStateText =
		"API keys are used to securely authenticate your requests from your server.";

	return (
		<Table.Provider
			config={{
				table: apiKeyTable,
				numberOfColumns: columns.length,
				enableSorting,
				isLoading: false,
				emptyStateText,
				rowClassName: "h-10",
			}}
		>
			<Table.Container>
				<Table.Content>
					<Table.Header />
					<Table.Body />
				</Table.Content>
			</Table.Container>
		</Table.Provider>
	);
};
