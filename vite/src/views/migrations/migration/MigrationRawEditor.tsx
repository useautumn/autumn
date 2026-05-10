import type { MigrationFilter, Operations } from "@autumn/shared";
import Editor, { type Monaco } from "@monaco-editor/react";
import { useStore } from "@tanstack/react-form";
import JSON5 from "json5";
import { useState } from "react";
import { useTheme } from "@/contexts/ThemeProvider";
import {
	AUTUMN_DARK,
	AUTUMN_LIGHT,
	registerAutumnThemes,
} from "@/lib/monacoThemes";
import type { MigrationEditorFormInstance } from "./useMigrationEditorForm";

function configureMonaco(monaco: Monaco) {
	monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
		noSemanticValidation: true,
		noSyntaxValidation: true,
		noSuggestionDiagnostics: true,
	});
	registerAutumnThemes(monaco);
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
	renderLineHighlight: "line" as const,
	overviewRulerBorder: false,
	scrollbar: {
		verticalScrollbarSize: 6,
		horizontalScrollbarSize: 6,
	},
};

function stringify(value: unknown): string {
	return JSON5.stringify(value, { space: 2, quote: '"' }) ?? "{}";
}

function RawField({
	label,
	description,
	value,
	onChange,
	height,
	theme,
}: {
	label: string;
	description: string;
	value: unknown;
	onChange: (parsed: unknown) => void;
	height: string;
	theme: string;
}) {
	const [text, setText] = useState(() => stringify(value));
	const [error, setError] = useState<string | null>(null);

	const handleChange = (newText: string) => {
		setText(newText);
		try {
			const parsed = JSON5.parse(newText);
			setError(null);
			onChange(parsed);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Invalid JSON5");
		}
	};

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-t2">{label}</span>
			<p className="text-xs text-t3 mb-2">{description}</p>
			<div className="rounded-md border border-border overflow-hidden">
				<Editor
					height={height}
					language="typescript"
					value={text}
					onChange={(v) => handleChange(v ?? "")}
					beforeMount={configureMonaco}
					options={EDITOR_OPTIONS}
					theme={theme}
				/>
			</div>
			{error && <div className="mt-1 text-xs text-red-500">{error}</div>}
		</div>
	);
}

export function MigrationRawEditor({
	form,
}: {
	form: MigrationEditorFormInstance["form"];
}) {
	const { isDark } = useTheme();
	const theme = isDark ? AUTUMN_DARK : AUTUMN_LIGHT;

	const filter = useStore(form.store, (s) => s.values.filter);
	const operations = useStore(form.store, (s) => s.values.operations);

	return (
		<div className="flex flex-col gap-6">
			<RawField
				label="Filter"
				description="Select which customers this migration applies to."
				value={filter}
				onChange={(parsed) =>
					form.setFieldValue("filter", parsed as MigrationFilter)
				}
				height="240px"
				theme={theme}
			/>
			<RawField
				label="Operations"
				description="Define the mutations applied to each matched customer."
				value={operations}
				onChange={(parsed) =>
					form.setFieldValue("operations", parsed as Operations)
				}
				height="360px"
				theme={theme}
			/>
		</div>
	);
}
