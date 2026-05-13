import type { Migration, MigrationFilter, Operations } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import type { AxiosError } from "axios";
import { debounce } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import { useMigrationsQuery } from "@/hooks/queries/useMigrationsQuery";
import { getBackendErr } from "@/utils/genUtils";

const AUTO_SAVE_DEBOUNCE_MS = 1000;

const FRIENDLY_MESSAGES: Record<string, string> = {
	"update_plan requires at least one of version or customize":
		"Each Update Plan needs at least a version or customization",
	"operations requires at least one resource block":
		"Add at least one operation",
};

function humanizeValidationError(raw: string): string {
	const stripped = raw.replace(/^\[Validation Errors\]\s*/, "");
	const segments = stripped.split(";").map((s) => s.trim());
	const messages = segments
		.map((segment) => {
			const withoutPath = segment.replace(/^[\w.[\]]+:\s*/, "");
			const friendly = FRIENDLY_MESSAGES[withoutPath];
			if (friendly) return friendly;
			return withoutPath.charAt(0).toUpperCase() + withoutPath.slice(1);
		})
		.filter(Boolean);
	return [...new Set(messages)].join(". ");
}

export function useMigrationEditorForm({
	migration,
}: {
	migration: Migration;
}) {
	const { updateMigration } = useMigrationsQuery();
	const [saveError, setSaveError] = useState<string | null>(null);
	const hasBeenValid = useRef(false);

	const form = useAppForm({
		defaultValues: {
			filter: (migration.filter ?? {
				customer: { plan: { plan_id: "" } },
			}) as MigrationFilter,
			operations: (migration.operations ?? {
				customer: [{ type: "update_plan", plan_filter: {} }],
			}) as Operations,
		},
		onSubmit: async ({ value }) => {
			try {
				await updateMigration({
					id: migration.id,
					updates: { filter: value.filter, operations: value.operations },
				});
				hasBeenValid.current = true;
				setSaveError(null);
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
					hasBeenValid.current = true;
					setSaveError(null);
				} catch (error) {
					if (hasBeenValid.current) {
						const raw = getBackendErr(error as AxiosError, "");
						setSaveError(humanizeValidationError(raw));
					}
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

	return { form, saveError };
}

export type MigrationEditorFormInstance = ReturnType<
	typeof useMigrationEditorForm
>;
