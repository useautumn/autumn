import { MigrationListTable } from "./migration-list/MigrationListTable";

export const MigrationsView = () => {
	return (
		<div className="flex flex-col gap-4 h-fit relative w-full pb-8 max-w-5xl mx-auto pt-4 sm:pt-8">
			<div className="h-fit max-h-full px-4 sm:px-10">
				<MigrationListTable />
			</div>
		</div>
	);
};
