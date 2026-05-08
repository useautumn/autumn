import Editor, { type Monaco } from "@monaco-editor/react";
import { useStore } from "@tanstack/react-form";
import type { MigrationEditorFormInstance } from "./useMigrationEditorForm";

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

export function MigrationEditorField({
	form,
	fieldName,
	title,
	description,
	height,
}: {
	form: MigrationEditorFormInstance["form"];
	fieldName: "filter" | "operations";
	title: string;
	description: string;
	height: string;
}) {
	const errorMap = useStore(form.store, (s) => s.errorMap);
	const fieldError =
		errorMap?.onChange && typeof errorMap.onChange === "object"
			? (errorMap.onChange as Record<string, string>)[fieldName]
			: undefined;

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-t2">{title}</span>
			<p className="text-xs text-t3 mb-2">{description}</p>
			<form.Field name={fieldName}>
				{(field) => (
					<div className="rounded-md border border-border overflow-hidden">
						<Editor
							height={height}
							language="typescript"
							value={field.state.value}
							onChange={(value) => field.handleChange(value ?? "")}
							beforeMount={configureMonaco}
							options={EDITOR_OPTIONS}
							theme="vs-dark"
						/>
					</div>
				)}
			</form.Field>
			{fieldError && (
				<div className="mt-1 text-xs text-red-500">{fieldError}</div>
			)}
		</div>
	);
}
