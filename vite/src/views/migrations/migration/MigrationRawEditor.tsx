import Editor, { type Monaco } from "@monaco-editor/react";
import JSON5 from "json5";
import { useRef, useState } from "react";
import { registerAutumnThemes } from "@/lib/monacoThemes";

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
	return JSON.stringify(value, null, 2) ?? "{}";
}

export function RawField({
	label,
	description,
	value,
	onChange,
	height,
	theme,
}: {
	label?: string;
	description?: string;
	value: unknown;
	onChange: (parsed: unknown) => void;
	height: string;
	theme: string;
}) {
	const [text, setText] = useState(() => stringify(value));
	const [error, setError] = useState<string | null>(null);
	const lastExternalRef = useRef(value);

	const serialized = stringify(value);
	if (lastExternalRef.current !== value && serialized !== text) {
		lastExternalRef.current = value;
		setText(serialized);
		setError(null);
	}

	const handleChange = (newText: string) => {
		setText(newText);
		try {
			const parsed = JSON5.parse(newText);
			lastExternalRef.current = parsed;
			setError(null);
			onChange(parsed);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Invalid JSON5");
		}
	};

	return (
		<div className="flex flex-col gap-1">
			{label && (
				<span className="text-xs font-medium text-t2">{label}</span>
			)}
			{description && (
				<p className="text-xs text-t3 mb-2">{description}</p>
			)}
			<div className="rounded-md border border-border overflow-hidden">
				<Editor
					height={height}
					language="json"
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
