import { PageContainer } from "@autumn/ui";
import { MigrationListTableView } from "../MigrationListTable";
import { fixtureRows } from "./migrationListFixtures";

export const MigrationListPreview = () => (
	<PageContainer>
		<MigrationListTableView rows={fixtureRows} isLoading={false} />
	</PageContainer>
);
