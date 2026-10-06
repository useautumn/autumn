import { PageContainer } from "@autumn/ui";
import { MigrationListTableView } from "../MigrationListTable";
import { fixtureRows } from "./migrationListFixtures";

/** Dev-only preview of every list state from static fixtures. */
export const MigrationListPreview = () => (
	<PageContainer>
		<MigrationListTableView rows={fixtureRows} isLoading={false} />
	</PageContainer>
);
