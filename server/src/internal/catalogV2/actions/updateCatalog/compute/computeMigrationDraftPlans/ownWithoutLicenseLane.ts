import type { MigrationTarget } from "@/internal/catalogV2/actions/buildMigrationDraft/types";

export const ownWithoutLicenseLane = ({
	own,
	license,
}: {
	own: MigrationTarget | null;
	license: MigrationTarget | null;
}): MigrationTarget | null => {
	if (!own) return null;
	if (!license) return own;

	const { upsert_licenses: _, ...customize } = own.customize;
	if (Object.keys(customize).length === 0) return null;
	return { ...own, customize };
};
