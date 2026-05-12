import type { Migration, MigrationFilter, Operations } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import type { AxiosError } from "axios";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr } from "@/utils/genUtils";

const AUTO_SAVE_DEBOUNCE_MS = 1000;

export function useMigrationEditorForm({
	migration,
}: {
	migration: Migration;
}) {
	const { updateMigration } = useMigrationsQuery();

	const form = useAppForm({
		defaultValues: {
			filter: (migration.filter ?? {
				customer: { plan: { plan_id: "" } },
			}) as MigrationFilter,
			operations: (migration.operations ?? {
				customer: [{ type: "update_plan", plan_filter: {}, version: 1 }],
			}) as Operations,
		},
		onSubmit: async ({ value }) => {
			try {
				await updateMigration({
					id: migration.id,
					updates: { filter: value.filter, operations: value.operations },
				});
			} catch (error) {
				toast.error(
					getBackendErr(error as AxiosError, "Failed to save migration"),
				);
			}
		},
	});

	const values = useStore(form.store, (s) => s.values);
	const serialized = JSON.stringify(values);
	const isInitialMount = useRef(true);

	const debouncedSave = useMemo(
		() =>
			debounce(async () => {
				try {
					const { filter, operations } = form.store.state.values;
					await updateMigration({
						id: migration.id,
						updates: { filter, operations },
					});
				} catch (error) {
					toast.error(getBackendErr(error as AxiosError, "Failed to save"));
				}
			}, AUTO_SAVE_DEBOUNCE_MS),
		[migration.id, updateMigration, form.store],
	);

	useEffect(() => {
		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}
		debouncedSave();
	}, [serialized, debouncedSave]);

	useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

	return { form };
}

export type MigrationEditorFormInstance = ReturnType<
	typeof useMigrationEditorForm
>;
