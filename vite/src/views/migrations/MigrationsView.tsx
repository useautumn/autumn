import { PageContainer } from "@autumn/ui";
import { MigrationListTable } from "./migration-list/MigrationListTable";

export const MigrationsView = () => {
	return (
		<PageContainer>
			<MigrationListTable />
		</PageContainer>
	);
};
