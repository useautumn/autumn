import { KeyIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Table } from "@/components/general/table";
import { Button } from "@/components/v2/buttons/Button";
import { EmptyState } from "@/components/v2/empty-states/EmptyState";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { useProductTable } from "@/views/products/hooks/useProductTable";
import { createAPIKeyTableColumns } from "./components/APIKeyTableColumns";
import { CreateApiKeyDialog } from "./components/CreateApiKeyDialog";

export const ApiKeysPage = () => {
	const { apiKeys } = useDevQuery();
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

	const hasRows = apiKeyTable.getRowModel().rows.length > 0;

	// Add keyboard shortcut: N to open create API key dialog
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.key === "n" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!e.shiftKey
			) {
				const target = e.target as HTMLElement;
				if (
					target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable
				) {
					return;
				}
				e.preventDefault();
				setCreateDialogOpen(true);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<div className="h-fit max-h-full">
			<CreateApiKeyDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
			/>
			{hasRows ? (
				<>
					<Table.Toolbar>
						<div className="flex w-full justify-between items-center">
							<Table.Heading>
								<KeyIcon size={16} weight="fill" className="text-subtle" />
								Secret API Keys
							</Table.Heading>
							<Table.Actions>
								<Button
									variant="primary"
									size="default"
									onClick={() => setCreateDialogOpen(true)}
								>
									Create Secret Key
								</Button>
							</Table.Actions>
						</div>
					</Table.Toolbar>

					<Table.Provider
						config={{
							table: apiKeyTable,
							numberOfColumns: columns.length,
							enableSorting,
							isLoading: false,
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
				</>
			) : (
				<EmptyState
					type="api-keys"
					actionButton={
						<Button
							variant="primary"
							size="default"
							onClick={() => setCreateDialogOpen(true)}
						>
							Create Secret Key
						</Button>
					}
				/>
			)}
		</div>
	);
};
