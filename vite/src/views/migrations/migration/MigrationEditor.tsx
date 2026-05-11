import type { Migration } from "@autumn/shared";
import {
	ArrowsClockwiseIcon,
	CodeIcon,
	PlayIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import { format } from "date-fns";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { Separator } from "@/components/v2/separator";
import { FilterForm } from "./filters/FilterForm";
import { MigrationRawEditor } from "./MigrationRawEditor";
import { OperationsForm } from "./operations/OperationsForm";
import { useMigrationEditorForm } from "./useMigrationEditorForm";

type EditorMode = "form" | "raw";

const CONFIRM_TIMEOUT_MS = 3000;

function useConfirmAction(action: () => void) {
	const [isConfirming, setIsConfirming] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>();

	const trigger = useCallback(() => {
		if (!isConfirming) {
			setIsConfirming(true);
			timerRef.current = setTimeout(() => setIsConfirming(false), CONFIRM_TIMEOUT_MS);
			return;
		}
		clearTimeout(timerRef.current);
		setIsConfirming(false);
		action();
	}, [isConfirming, action]);

	const cancel = useCallback(() => {
		clearTimeout(timerRef.current);
		setIsConfirming(false);
	}, []);

	return { isConfirming, trigger, cancel };
}

export function MigrationEditor({
	migration,
	onSwitchToRuns,
}: {
	migration: Migration;
	onSwitchToRuns?: () => void;
}) {
	const { form, handleDryRun, handleRealRun, isUpdating, isRunning } =
		useMigrationEditorForm({ migration, onRunTriggered: onSwitchToRuns });

	const [mode, setMode] = useState<EditorMode>("form");
	const confirm = useConfirmAction(handleRealRun);
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
					<GroupedTabButton
						value={mode}
						onValueChange={(v) => setMode(v as EditorMode)}
						options={[
							{ value: "form", label: "Form" },
							{ value: "raw", label: "JSON", icon: <CodeIcon size={14} /> },
						]}
					/>
					<Button
						variant="secondary"
						size="default"
						onClick={handleDryRun}
						isLoading={isRunning}
					>
						<PlayIcon size={14} weight="fill" />
						Dry Run
					</Button>
					<Button
						variant={confirm.isConfirming ? "destructive" : "primary"}
						size="default"
						onClick={confirm.trigger}
						onBlur={confirm.cancel}
						isLoading={isRunning}
					>
						{confirm.isConfirming ? (
							<WarningIcon size={14} weight="fill" />
						) : (
							<PlayIcon size={14} weight="fill" />
						)}
						{confirm.isConfirming ? "Confirm Run" : "Run"}
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

			{mode === "form" ? (
				<MigrationFormMode form={form} />
			) : (
				<MigrationRawEditor form={form} />
			)}
		</div>
	);
}

function MigrationFormMode({
	form,
}: {
	form: MigrationEditorFormInstance["form"];
}) {
	const filter = useStore(form.store, (s) => s.values.filter);
	const operations = useStore(form.store, (s) => s.values.operations);

	return (
		<div className="flex flex-col gap-4">
			<FormSection
				title="Filter"
				description="Select which customers this migration applies to."
			>
				<FilterForm
					value={filter}
					onChange={(updated) => form.setFieldValue("filter", updated)}
				/>
			</FormSection>

			<Separator />

			<FormSection
				title="Operations"
				description="Define the mutations applied to each matched customer."
			>
				<OperationsForm
					value={operations}
					onChange={(updated) => form.setFieldValue("operations", updated)}
				/>
			</FormSection>
		</div>
	);
}

function FormSection({
	title,
	description,
	children,
}: {
	title: string;
	description: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3">
			<div>
				<h2 className="text-sm font-medium text-t1">{title}</h2>
				<p className="text-xs text-t3">{description}</p>
			</div>
			{children}
		</div>
	);
}

type MigrationEditorFormInstance = ReturnType<typeof useMigrationEditorForm>;
