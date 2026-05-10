import type { Migration, MigrationFilter, Operations } from "@autumn/shared";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr } from "@/utils/genUtils";

export function useMigrationEditorForm({
	migration,
}: {
	migration: Migration;
}) {
	const { updateMigration, isUpdating, runMigration, isRunning } =
		useMigrationsQuery();

	const form = useAppForm({
		defaultValues: {
			filter: (migration.filter ?? {
				customer: { plan: { plan_id: "" } },
			}) as MigrationFilter,
			operations: (migration.operations ?? {
				customer: [],
			}) as Operations,
		},
		onSubmit: async ({ value }) => {
			try {
				await updateMigration({
					id: migration.id,
					updates: {
						filter: value.filter,
						operations: value.operations,
					},
				});
				toast.success("Migration saved");
			} catch (error) {
				toast.error(
					getBackendErr(error as AxiosError, "Failed to save migration"),
				);
			}
		},
	});

	const handleRun = async () => {
		try {
			const result = await runMigration({ id: migration.id, dry_run: true });
			toast.success(`Migration triggered (run ${result.run_id})`);
		} catch (error) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to run migration"),
			);
		}
	};

	return { form, handleRun, isUpdating, isRunning };
}

export type MigrationEditorFormInstance = ReturnType<
	typeof useMigrationEditorForm
>;
