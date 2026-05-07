import type { Migration } from "@autumn/shared";
import Editor, { type Monaco } from "@monaco-editor/react";
import { PlayIcon } from "@phosphor-icons/react";
import type { AxiosError } from "axios";
import JSON5 from "json5";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
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
	// JSON5.stringify with no quotes around safe identifier keys
	return JSON5.stringify(value, { space: 2, quote: '"' });
}

function tryParse(text: string) {
	const trimmed = text.trim();
	if (!trimmed) return { value: null as unknown, error: null as string | null };
	try {
		return { value: JSON5.parse(trimmed), error: null };
	} catch (err) {
		return {
			value: null,
			error: err instanceof Error ? err.message : "Invalid syntax",
		};
	}
}

// Disable TS diagnostics so bare object literals like `{ a: 1 }` don't squiggle.
function configureMonaco(monaco: Monaco) {
	monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
		noSemanticValidation: true,
		noSyntaxValidation: true,
		noSuggestionDiagnostics: true,
	});
}

const EDITOR_OPTIONS = {
	minimap: { enabled: false },
	scrollBeyondLastLine: false,
	fontSize: 12,
	tabSize: 2,
	wordWrap: "on" as const,
	formatOnPaste: true,
	formatOnType: true,
	glyphMargin: false,
	folding: false,
	lineNumbersMinChars: 2,
	lineDecorationsWidth: 4,
	padding: { top: 8, bottom: 8 },
};

function EditMigrationSheet({
	migration,
	open,
	onOpenChange,
}: {
	migration: Migration | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { updateMigration, isUpdating, runMigration, isRunning } =
		useMigrationsQuery();

	const [filterText, setFilterText] = useState("");
	const [operationsText, setOperationsText] = useState("");

	useEffect(() => {
		if (!migration) return;
		setFilterText(stringify(migration.filter, EMPTY_FILTER));
		setOperationsText(stringify(migration.operations, EMPTY_OPERATIONS));
	}, [migration]);

	const filterParsed = useMemo(() => tryParse(filterText), [filterText]);
	const operationsParsed = useMemo(
		() => tryParse(operationsText),
		[operationsText],
	);

	const canSave = !filterParsed.error && !operationsParsed.error;

	const handleSave = async () => {
		if (!migration || !canSave) return;
		try {
			await updateMigration({
				id: migration.id,
				updates: {
					filter: filterParsed.value as null,
					operations: operationsParsed.value as null,
				},
			});
			toast.success("Migration saved");
			onOpenChange(false);
		} catch (error) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to save migration"),
			);
		}
	};

	const handleRun = async () => {
		if (!migration) return;
		try {
			const result = await runMigration({ id: migration.id, dry_run: true });
			toast.success(`Migration triggered (run ${result.run_id})`);
		} catch (error) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to run migration"),
			);
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden sm:max-w-[640px]">
				<SheetHeader
					title={migration?.id ?? "Migration"}
					description="Edit the filter that selects rows and the operations applied to each match. Object literal syntax (TypeScript-style) is supported."
					action={
						<Button
							variant="secondary"
							size="sm"
							onClick={handleRun}
							isLoading={isRunning}
							disabled={!migration?.operations && !operationsText.trim()}
						>
							<PlayIcon size={14} weight="fill" />
							Run
						</Button>
					}
				/>

				<div className="flex-1 overflow-y-auto">
					<SheetSection title="Filter">
						<div className="rounded-md border border-border overflow-hidden">
							<Editor
								height="240px"
								language="typescript"
								value={filterText}
								onChange={(value) => setFilterText(value ?? "")}
								beforeMount={configureMonaco}
								options={EDITOR_OPTIONS}
								theme="vs-dark"
							/>
						</div>
						{filterParsed.error && (
							<div className="mt-2 text-xs text-red-500">
								{filterParsed.error}
							</div>
						)}
					</SheetSection>

					<SheetSection title="Operations" withSeparator={false}>
						<div className="rounded-md border border-border overflow-hidden">
							<Editor
								height="280px"
								language="typescript"
								value={operationsText}
								onChange={(value) => setOperationsText(value ?? "")}
								beforeMount={configureMonaco}
								options={EDITOR_OPTIONS}
								theme="vs-dark"
							/>
						</div>
						{operationsParsed.error && (
							<div className="mt-2 text-xs text-red-500">
								{operationsParsed.error}
							</div>
						)}
					</SheetSection>
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={() => onOpenChange(false)}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={handleSave}
						metaShortcut="enter"
						isLoading={isUpdating}
						disabled={!canSave}
					>
						Save
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default EditMigrationSheet;
