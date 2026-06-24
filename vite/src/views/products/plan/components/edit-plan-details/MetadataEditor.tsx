import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useState } from "react";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";

const METADATA_THEME = "autumn-plan-metadata";

const stringify = (value: unknown) => {
	try {
		return JSON.stringify(value ?? {}, null, 2);
	} catch {
		return "{}";
	}
};

const parseMetadata = (
	text: string,
): { value: Record<string, unknown> } | { error: string } => {
	const trimmed = text.trim();
	if (trimmed === "") return { value: {} };

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return { error: "Invalid JSON" };
	}

	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { error: "Metadata must be a JSON object" };
	}

	return { value: parsed as Record<string, unknown> };
};

export function MetadataEditor() {
	const { product, setProduct } = useProduct();

	const externalJson = stringify(product.metadata);
	const [text, setText] = useState(externalJson);
	const [syncedJson, setSyncedJson] = useState(externalJson);

	// Re-seed when metadata changes outside the editor (version switch, discard);
	// our own edits advance `syncedJson` first so they don't clobber typing.
	if (externalJson !== syncedJson) {
		setSyncedJson(externalJson);
		setText(externalJson);
	}

	const parsed = parseMetadata(text);
	const error = "error" in parsed ? parsed.error : null;

	const onMount: OnMount = useCallback((editor, monaco) => {
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => {
			editor.trigger("keyboard", "undo", null);
		});
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => {
			editor.trigger("keyboard", "redo", null);
		});

		monaco.editor.defineTheme(METADATA_THEME, {
			base: "vs-dark",
			inherit: true,
			rules: [],
			colors: {
				"editor.background": "#00000000",
				"editor.foreground": "#dddddd",
				"editorLineNumber.foreground": "#4a4a4a",
				"editorLineNumber.activeForeground": "#8a8a8a",
				"editor.lineHighlightBackground": "#ffffff08",
				"editor.selectionBackground": "#8838ff40",
				"editor.inactiveSelectionBackground": "#8838ff20",
				"editorIndentGuide.background1": "#222222",
				"editorIndentGuide.activeBackground1": "#333333",
				"editorBracketMatch.background": "#8838ff20",
				"editorBracketMatch.border": "#8838ff80",
				"editorWidget.background": "#1a1a1a",
				"editorWidget.border": "#222222",
				"input.background": "#0f0f0f",
				"input.border": "#222222",
				"scrollbarSlider.background": "#ffffff14",
				"scrollbarSlider.hoverBackground": "#ffffff20",
				"scrollbarSlider.activeBackground": "#ffffff30",
			},
		});
		monaco.editor.setTheme(METADATA_THEME);
	}, []);

	const onChange = (value: string | undefined) => {
		const next = value ?? "";
		setText(next);

		const result = parseMetadata(next);
		if ("error" in result) return;

		setSyncedJson(stringify(result.value));
		setProduct({ ...product, metadata: result.value });
	};

	return (
		<div>
			{/* Keep bare keys in the editor: the base-ui accordion and global
			    hotkeys would otherwise hijack arrows/letters. Modifier combos pass
			    through (e.g. ⌘/Ctrl save). */}
			<div
				className="relative border border-border rounded overflow-hidden bg-input-background"
				onKeyDown={(event) => {
					if (!(event.metaKey || event.ctrlKey || event.altKey)) {
						event.stopPropagation();
					}
				}}
			>
				<Editor
					height="160px"
					language="json"
					value={text}
					onMount={onMount}
					onChange={onChange}
					options={{
						minimap: { enabled: false },
						lineNumbers: "on",
						lineNumbersMinChars: 3,
						folding: true,
						scrollBeyondLastLine: false,
						fontSize: 12,
						fontFamily:
							"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
						tabSize: 2,
						wordWrap: "on",
						renderLineHighlight: "none",
						glyphMargin: false,
						contextmenu: false,
						formatOnPaste: true,
						quickSuggestions: false,
						suggestOnTriggerCharacters: false,
						wordBasedSuggestions: "off",
						hover: { enabled: false },
						parameterHints: { enabled: false },
						padding: { top: 8, bottom: 8 },
						scrollbar: {
							verticalScrollbarSize: 8,
							horizontalScrollbarSize: 8,
							useShadows: false,
						},
						overviewRulerLanes: 0,
						hideCursorInOverviewRuler: true,
						overviewRulerBorder: false,
						stickyScroll: { enabled: false },
					}}
				/>
			</div>
			{error && <p className="text-destructive text-xs mt-1">{error}</p>}
		</div>
	);
}
