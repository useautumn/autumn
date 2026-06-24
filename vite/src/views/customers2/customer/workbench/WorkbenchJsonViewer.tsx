import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useMemo, useRef } from "react";
import { CopyTextButton } from "@autumn/ui";

const AUTUMN_DARK_THEME = "autumn-workbench-dark";
const AUTUMN_LIGHT_THEME = "autumn-workbench-light";

export const WorkbenchJsonViewer = ({
	data,
	height = "400px",
}: {
	data: unknown;
	height?: string;
}) => {
	const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

	const formatted = useMemo(() => {
		try {
			return JSON.stringify(data, null, 2);
		} catch {
			return String(data);
		}
	}, [data]);

	const onMount: OnMount = useCallback((editor, monaco) => {
		editorRef.current = editor;

		monaco.editor.defineTheme(AUTUMN_DARK_THEME, {
			base: "vs-dark",
			inherit: true,
			rules: [],
			colors: {
				"editor.background": "#00000000",
				"editor.foreground": "#e7e7e7",
				"editorLineNumber.foreground": "#4a4a4a",
				"editorLineNumber.activeForeground": "#8a8a8a",
				"editor.lineHighlightBackground": "#ffffff08",
				"editor.selectionBackground": "#3b82f640",
				"editor.inactiveSelectionBackground": "#3b82f620",
				"editorIndentGuide.background1": "#2a2a2a",
				"editorIndentGuide.activeBackground1": "#3a3a3a",
				"editorBracketMatch.background": "#3b82f620",
				"editorBracketMatch.border": "#3b82f680",
				"editorWidget.background": "#1a1a1a",
				"editorWidget.border": "#2a2a2a",
				"input.background": "#0f0f0f",
				"input.border": "#2a2a2a",
				"editor.findMatchBackground": "#fbbf2440",
				"editor.findMatchHighlightBackground": "#fbbf2420",
				"scrollbarSlider.background": "#ffffff14",
				"scrollbarSlider.hoverBackground": "#ffffff20",
				"scrollbarSlider.activeBackground": "#ffffff30",
			},
		});

		monaco.editor.defineTheme(AUTUMN_LIGHT_THEME, {
			base: "vs",
			inherit: true,
			rules: [],
			colors: {
				"editor.background": "#00000000",
				"editorLineNumber.foreground": "#c0c0c0",
				"editor.lineHighlightBackground": "#00000005",
			},
		});

		const isDark = document.documentElement.classList.contains("dark");
		monaco.editor.setTheme(isDark ? AUTUMN_DARK_THEME : AUTUMN_LIGHT_THEME);

		let folded = false;
		const foldChildren = () => {
			if (folded) return;
			editor.getAction("editor.foldLevel2")?.run();
			folded = true;
		};

		const sub = editor.onDidChangeModelDecorations(() => {
			foldChildren();
			sub.dispose();
		});
		setTimeout(() => {
			foldChildren();
			sub.dispose();
		}, 250);
	}, []);

	return (
		<div className="relative border border-border/40 rounded overflow-hidden bg-stone-50 dark:bg-stone-950/60">
			<div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
				<button
					type="button"
					onClick={() => {
						editorRef.current?.getAction("actions.find")?.run();
					}}
					className="text-[10px] font-mono text-subtle hover:text-muted-foreground cursor-pointer px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800/80 border border-border/40"
					title="Find (Ctrl+F)"
				>
					⌘F
				</button>
				<CopyTextButton
					text={formatted}
					className="bg-stone-100 dark:bg-stone-800/80 shadow-none hover:bg-stone-200 dark:hover:bg-stone-800 w-5 gap-0 h-5 !px-0 py-0 flex items-center justify-center text-tertiary-foreground cursor-pointer border border-border/40 rounded"
				/>
			</div>
			<Editor
				height={height}
				language="json"
				value={formatted}
				onMount={onMount}
				options={{
					readOnly: true,
					domReadOnly: true,
					minimap: { enabled: false },
					lineNumbers: "on",
					lineNumbersMinChars: 3,
					folding: true,
					foldingStrategy: "auto",
					showFoldingControls: "always",
					foldingHighlight: true,
					scrollBeyondLastLine: false,
					fontSize: 11,
					fontFamily:
						"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
					tabSize: 2,
					wordWrap: "on",
					renderLineHighlight: "none",
					glyphMargin: false,
					contextmenu: false,
					quickSuggestions: false,
					occurrencesHighlight: "off",
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
};
