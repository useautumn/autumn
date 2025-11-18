import { KeyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Table } from "@/components/general/table";
import { Button } from "@/components/v2/buttons/Button";
import { useDevQuery } from "@/hooks/queries/useDevQuery";
import { APIKeyTable } from "./components/APIKeyTable";
import { CreateApiKeyDialog } from "./components/CreateApiKeyDialog";

export const ApiKeysPage = () => {
	const { apiKeys } = useDevQuery();
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

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
		<div className="h-fit max-h-full px-10">
			<CreateApiKeyDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
			/>

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

			<APIKeyTable apiKeys={apiKeys} />
		</div>
	);
};
