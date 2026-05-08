import type { Migration } from "@autumn/shared";
import { ArrowsClockwiseIcon, PlayIcon } from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { format } from "date-fns";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { MigrationEditorField } from "./MigrationEditorField";
import { useMigrationEditorForm } from "./useMigrationEditorForm";

export function MigrationEditor({ migration }: { migration: Migration }) {
	const { form, handleRun, isUpdating, isRunning } = useMigrationEditorForm({
		migration,
	});

	const canSubmit = useStore(form.store, (s) => s.canSubmit);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<ArrowsClockwiseIcon
						size={20}
						weight="fill"
						className="text-subtle"
					/>
					<div className="flex flex-col">
						<h1 className="text-md font-medium text-t1">{migration.id}</h1>
						<span className="text-xs text-t3">
							Created {format(new Date(migration.created_at), "PP")}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="secondary"
						size="default"
						onClick={handleRun}
						isLoading={isRunning}
					>
						<PlayIcon size={14} weight="fill" />
						Dry Run
					</Button>
					<ShortcutButton
						size="default"
						onClick={() => form.handleSubmit()}
						metaShortcut="s"
						isLoading={isUpdating}
						disabled={!canSubmit}
					>
						Save
					</ShortcutButton>
				</div>
			</div>

			<MigrationEditorField
				form={form}
				fieldName="filter"
				title="Filter"
				description="Select which customers this migration applies to."
				height="240px"
			/>

			<MigrationEditorField
				form={form}
				fieldName="operations"
				title="Operations"
				description="Define the mutations applied to each matched customer."
				height="360px"
			/>
		</div>
	);
}
