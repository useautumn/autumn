import { MigrationListTable } from "./migration-list/MigrationListTable";

export const MigrationsView = () => {
	return (
		<div className="h-fit max-h-full px-4 sm:px-10">
			<MigrationListTable />
		</div>
	);
};
