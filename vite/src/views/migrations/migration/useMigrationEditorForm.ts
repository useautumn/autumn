import type { Migration } from "@autumn/shared";
import type { AxiosError } from "axios";
import JSON5 from "json5";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr } from "@/utils/genUtils";

const EMPTY_FILTER = `{
  customer: {},
}
`;

const EMPTY_OPERATIONS = `{
  customer: {},
}
`;

function stringify(value: unknown, fallback: string) {
	if (value === null || value === undefined) return fallback;
	return JSON5.stringify(value, { space: 2, quote: '"' });
}

function tryParseJson5(value: string) {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return JSON5.parse(trimmed);
}

export function useMigrationEditorForm({
	migration,
}: {
	migration: Migration;
}) {
	const { updateMigration, isUpdating, runMigration, isRunning } =
		useMigrationsQuery();

	const form = useAppForm({
		defaultValues: {
			filter: stringify(migration.filter, EMPTY_FILTER),
			operations: stringify(migration.operations, EMPTY_OPERATIONS),
		},
		validators: {
			onChange: ({ value }) => {
				const errors: Record<string, string> = {};
				try {
					tryParseJson5(value.filter);
				} catch {
					errors.filter = "Invalid JSON5 syntax";
				}
				try {
					tryParseJson5(value.operations);
				} catch {
					errors.operations = "Invalid JSON5 syntax";
				}
				return Object.keys(errors).length > 0 ? errors : undefined;
			},
		},
		onSubmit: async ({ value }) => {
			try {
				await updateMigration({
					id: migration.id,
					updates: {
						filter: tryParseJson5(value.filter) ?? null,
						operations: tryParseJson5(value.operations) ?? null,
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
