import Editor, { type OnMount } from "@monaco-editor/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const CATALOG_JSON_THEME = "autumn-catalog-json";

const defineCatalogJsonTheme: OnMount = (_editor, monaco) => {
	monaco.editor.defineTheme(CATALOG_JSON_THEME, {
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
			"editorWidget.background": "#1a1a1a",
			"editorWidget.border": "#222222",
			"scrollbarSlider.background": "#ffffff14",
			"scrollbarSlider.hoverBackground": "#ffffff20",
			"scrollbarSlider.activeBackground": "#ffffff30",
		},
	});
	monaco.editor.setTheme(CATALOG_JSON_THEME);
};

export function CatalogJsonEditor({
	value,
	onChange,
	readOnly = false,
	disabled = false,
	height,
	placeholder,
	badge,
	className,
}: {
	value: string;
	onChange?: (value: string) => void;
	readOnly?: boolean;
	disabled?: boolean;
	height: string;
	placeholder?: string;
	badge?: ReactNode;
	className?: string;
}) {
	return (
		// Bare keys stay in the editor: dialog and global hotkeys would otherwise hijack them.
		<div
			className={cn(
				"relative overflow-hidden rounded-lg border border-border bg-input-background",
				!readOnly && !disabled && "focus-within:border-primary/60",
				disabled && "pointer-events-none opacity-50",
				className,
			)}
			onKeyDown={(event) => {
				if (!(event.metaKey || event.ctrlKey || event.altKey))
					event.stopPropagation();
			}}
		>
			{badge && <div className="absolute top-2 right-3 z-10">{badge}</div>}
			{placeholder && value === "" && (
				<span className="pointer-events-none absolute top-2 left-[50px] z-10 font-mono text-subtle text-xs">
					{placeholder}
				</span>
			)}
			<Editor
				height={height}
				language="json"
				value={value}
				onMount={defineCatalogJsonTheme}
				onChange={(next) => onChange?.(next ?? "")}
				options={{
					readOnly: readOnly || disabled,
					domReadOnly: readOnly || disabled,
					minimap: { enabled: false },
					lineNumbers: "on",
					lineNumbersMinChars: 4,
					folding: true,
					scrollBeyondLastLine: false,
					fontSize: 12,
					fontFamily:
						"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
					tabSize: 2,
					renderLineHighlight: "none",
					glyphMargin: false,
					contextmenu: false,
					formatOnPaste: true,
					quickSuggestions: false,
					suggestOnTriggerCharacters: false,
					wordBasedSuggestions: "off",
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
	);
}
