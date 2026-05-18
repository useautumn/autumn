import { PageContainer } from "@/components/general/PageContainer";
import { MigrationListTable } from "./migration-list/MigrationListTable";

export const MigrationsView = () => {
	return (
		<PageContainer>
			<MigrationListTable />
		</PageContainer>
	);
};
