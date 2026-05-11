import type { Migration, MigrationFilter, Operations } from "@autumn/shared";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr } from "@/utils/genUtils";

export function useMigrationEditorForm({
	migration,
	onRunTriggered,
}: {
	migration: Migration;
	onRunTriggered?: () => void;
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
					updates: { filter: value.filter, operations: value.operations },
				});
				toast.success("Migration saved");
			} catch (error) {
				toast.error(
					getBackendErr(error as AxiosError, "Failed to save migration"),
				);
			}
		},
	});

	const triggerRun = async (dryRun: boolean) => {
		try {
			const label = dryRun ? "Dry run" : "Migration run";
			const result = await runMigration({ id: migration.id, dry_run: dryRun });
			toast.success(`${label} triggered (${result.run_id})`);
			onRunTriggered?.();
		} catch (error) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to run migration"),
			);
		}
	};

	const handleDryRun = () => triggerRun(true);
	const handleRealRun = () => triggerRun(false);

	return { form, handleDryRun, handleRealRun, isUpdating, isRunning };
}

export type MigrationEditorFormInstance = ReturnType<
	typeof useMigrationEditorForm
>;
