/** @jsxImportSource @opentui/react */
/**
 * The `bun tw` swarm TUI — a responsive two-pane opentui app.
 *
 *   Pane A — phase-driven progress + test results (warm spinner, fan-out and
 *            teardown progress bars, the live test runner, and the final summary
 *            with wall-clock + cost).
 *   Pane B — the raw log firehose (orchestrator / ingress / worker output),
 *            independently scrollable, auto-following the tail.
 *
 * A draggable divider resizes the split. The orchestrator mutates the shared
 * `store`; this app reads it live on a ~10fps tick (mutable-state + interval
 * flush) to keep updates cheap and flicker-free.
 *
 * Layout rule of thumb (opentui/yoga): every fill container sets `flexGrow:1`,
 * `flexBasis:0`, `minWidth:0`, `minHeight:0`; every fixed row sets `flexShrink:0`.
 * Without these, scrollboxes and sibling rows OVERLAP instead of stacking.
 */

import { useTerminalDimensions } from "@opentui/react";
import { useEffect, useState } from "react";
import {
	getTuiState,
	runTallies,
	type TuiState,
	type TuiTestFile,
} from "./store.ts";

const COLOR = {
	accent: "#7c83ff",
	cyan: "#56b6c2",
	green: "#98c379",
	red: "#e06c75",
	yellow: "#e5c07b",
	dim: "#5c6370",
	text: "#c8ccd4",
} as const;

const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const spinnerFrame = (): string =>
	SPINNER[Math.floor(Date.now() / 80) % SPINNER.length] ?? "⠋";

const elide = (text: string, max: number): string => {
	if (max <= 1 || text.length <= max) {
		return text;
	}
	return `${text.slice(0, max - 1)}…`;
};

const basename = (path: string): string => path.split("/").pop() ?? path;

const bar = (done: number, total: number, width: number): string => {
	const ratio = total > 0 ? Math.min(1, done / total) : 0;
	const filled = Math.round(ratio * width);
	return "▰".repeat(filled) + "▱".repeat(Math.max(0, width - filled));
};

const ProgressBar = ({
	label,
	done,
	total,
	color = COLOR.accent,
}: {
	label: string;
	done: number;
	total: number;
	color?: string;
}) => (
	<box style={{ flexDirection: "row", gap: 1, flexShrink: 0 }}>
		<text style={{ fg: COLOR.dim }}>{label.padEnd(9)}</text>
		<text style={{ fg: color }}>{bar(done, total, 24)}</text>
		<text style={{ fg: COLOR.dim }}>
			{done}/{total}
		</text>
	</box>
);

const Header = ({ state }: { state: TuiState }) => (
	<box style={{ flexDirection: "row", gap: 1, flexShrink: 0 }}>
		<text style={{ fg: COLOR.accent }}>swarm</text>
		<text style={{ fg: COLOR.text }}>{state.target || "core"}</text>
		<text style={{ fg: COLOR.dim }}>·</text>
		<text style={{ fg: COLOR.dim }}>{state.workers} workers</text>
		<text style={{ fg: COLOR.dim }}>·</text>
		<text style={{ fg: COLOR.cyan }}>{state.phase}</text>
		{state.dashboardUrl ? (
			<>
				<text style={{ fg: COLOR.dim }}>·</text>
				<text style={{ fg: COLOR.accent }}>{state.dashboardUrl}</text>
			</>
		) : null}
	</box>
);

const RunningFile = ({ file }: { file: TuiTestFile }) => {
	const color = file.status === "retrying" ? COLOR.yellow : COLOR.cyan;
	const current = file.currentTest ? ` › ${file.currentTest}` : "";
	return (
		<text style={{ fg: color }}>
			{spinnerFrame()}{" "}
			{elide(
				`${basename(file.file)} (✓${file.passed} ✗${file.failed})${current}`,
				68,
			)}
		</text>
	);
};

/** Fixed status row for the RUN phase — single line so nothing overlaps. */
const RunStatus = ({ state }: { state: TuiState }) => {
	const t = runTallies();
	return (
		<box style={{ flexDirection: "row", gap: 1, flexShrink: 0 }}>
			<text style={{ fg: COLOR.green }}>{bar(t.done, state.runTotal, 18)}</text>
			<text style={{ fg: COLOR.dim }}>
				{t.done}/{state.runTotal}
			</text>
			<text style={{ fg: COLOR.green }}>✓{t.passed}</text>
			<text style={{ fg: COLOR.red }}>✗{t.failed}</text>
			<text style={{ fg: COLOR.cyan }}>{t.running}▶</text>
			<text style={{ fg: COLOR.yellow }}>{t.retrying}↻</text>
		</box>
	);
};

/**
 * Scrollable list of the IN-PROGRESS tests for the RUN phase. Completed files are
 * NOT shown here — they're logged to Pane B as they finish (see store.upsertTestFile).
 */
const RunList = ({ state }: { state: TuiState }) => {
	const running = Array.from(state.files.values()).filter(
		(f) => f.status === "running" || f.status === "retrying",
	);
	return (
		<scrollbox
			scrollY={true}
			style={{
				flexGrow: 1,
				flexBasis: 0,
				minHeight: 0,
				flexDirection: "column",
			}}
		>
			{running.map((f) => (
				<RunningFile file={f} key={`run-${f.file}`} />
			))}
		</scrollbox>
	);
};

const SummaryList = ({ state }: { state: TuiState }) => {
	const s = state.summary;
	if (!s) {
		return <text style={{ fg: COLOR.dim }}>finishing…</text>;
	}
	const allPassed = s.failed === 0 && s.crashed === 0;
	const sec = Math.round(s.wallMs / 1000);
	return (
		<scrollbox
			scrollY={true}
			style={{
				flexGrow: 1,
				flexBasis: 0,
				minHeight: 0,
				flexDirection: "column",
			}}
		>
			<text style={{ fg: allPassed ? COLOR.green : COLOR.red }}>
				{allPassed
					? `✓ ALL ${s.passed} TESTS PASSED`
					: `FAILED — ${s.failed} failed, ${s.crashed} crashed, ${s.passed} passed`}
			</text>
			<text style={{ fg: COLOR.text }}>
				wall-clock {Math.floor(sec / 60)}m{sec % 60}s
			</text>
			{s.costLine ? <text style={{ fg: COLOR.cyan }}>{s.costLine}</text> : null}
			{s.logFile ? (
				<text style={{ fg: COLOR.dim }}>full run log: {s.logFile}</text>
			) : null}
			{Array.from(state.files.values())
				.filter((f) => f.status === "failed")
				.map((f) => (
					<box
						key={`fail-${f.file}`}
						style={{ flexDirection: "column", marginTop: 1 }}
					>
						<text style={{ fg: COLOR.red }}>📁 {basename(f.file)}</text>
						{f.failedTests.map((test, index) => (
							<text key={`${f.file}-${index}`} style={{ fg: COLOR.dim }}>
								{" "}
								✗ {test.name}
								{test.location ? ` (${test.location})` : ""}
							</text>
						))}
					</box>
				))}
		</scrollbox>
	);
};

const PaneA = ({ state }: { state: TuiState }) => (
	<box
		style={{
			flexDirection: "column",
			flexGrow: 1,
			flexBasis: 0,
			minHeight: 0,
			minWidth: 0,
			padding: 1,
		}}
	>
		<Header state={state} />
		<text style={{ fg: COLOR.dim, flexShrink: 0 }}>{"─".repeat(30)}</text>

		{state.phase === "warm" ? (
			<box style={{ flexDirection: "row", gap: 1, flexShrink: 0 }}>
				<text style={{ fg: COLOR.cyan }}>{spinnerFrame()}</text>
				<text style={{ fg: COLOR.text }}>
					{state.warmActivity ||
						(state.warmBuilding ? "building warm parent…" : "warming…")}
				</text>
			</box>
		) : null}

		{state.phase === "fanout" ? (
			<box style={{ flexDirection: "column", flexShrink: 0 }}>
				<ProgressBar
					done={state.stripeDone}
					label="stripe"
					total={state.stripeTotal}
				/>
				<ProgressBar
					color={COLOR.cyan}
					done={state.workersReady}
					label="workers"
					total={state.workersTotal}
				/>
			</box>
		) : null}

		{state.phase === "run" ? (
			<>
				<RunStatus state={state} />
				<RunList state={state} />
			</>
		) : null}

		{state.phase === "teardown" ? (
			<box style={{ flexDirection: "column", flexShrink: 0 }}>
				{/* Results are already known entering teardown — show them now instead
				    of waiting for teardown to finish. */}
				{state.summary ? <SummaryList state={state} /> : null}
				<ProgressBar
					color={COLOR.yellow}
					done={state.sandboxesDone}
					label="sandboxes"
					total={state.sandboxesTotal}
				/>
				<ProgressBar
					color={COLOR.yellow}
					done={state.accountsDone}
					label="accounts"
					total={state.accountsTotal}
				/>
			</box>
		) : null}

		{state.phase === "done" ? <SummaryList state={state} /> : null}
	</box>
);

const PaneB = ({ logs }: { logs: string[] }) => (
	<box
		style={{
			flexDirection: "column",
			flexGrow: 1,
			flexBasis: 0,
			minHeight: 0,
			minWidth: 0,
			padding: 1,
		}}
	>
		<scrollbox
			focusable={true}
			scrollY={true}
			stickyScroll={true}
			stickyStart="bottom"
			style={{
				flexGrow: 1,
				flexBasis: 0,
				minHeight: 0,
				flexDirection: "column",
			}}
		>
			{logs.slice(-1000).map((line, index) => (
				<text key={`log-${index}`} style={{ fg: COLOR.dim }}>
					{line || " "}
				</text>
			))}
		</scrollbox>
	</box>
);

const clampSplit = (n: number): number => Math.max(0.15, Math.min(0.85, n));

export const App = () => {
	const [, setTick] = useState(0);
	const [split, setSplit] = useState(0.55);
	useEffect(() => {
		const interval = setInterval(() => setTick((n) => n + 1), 100);
		return () => clearInterval(interval);
	}, []);

	const state = getTuiState();
	const { width, height } = useTerminalDimensions();
	// Prefer a side-by-side split on anything but a genuinely narrow terminal.
	const wide = width >= 80;

	const onDividerDrag = (event: { x: number; y: number }): void => {
		setSplit(clampSplit(wide ? event.x / width : event.y / height));
	};

	const fill = {
		flexGrow: 1,
		flexBasis: 0,
		minWidth: 0,
		minHeight: 0,
		flexDirection: "column" as const,
	};

	return (
		<box
			style={{
				width: "100%",
				height: "100%",
				flexDirection: wide ? "row" : "column",
			}}
		>
			<box style={{ ...fill, flexGrow: split }}>
				<PaneA state={state} />
			</box>
			<box
				onMouseDrag={onDividerDrag}
				style={
					wide
						? { width: 1, height: "100%", backgroundColor: COLOR.dim }
						: { width: "100%", height: 1, backgroundColor: COLOR.dim }
				}
			/>
			<box style={{ ...fill, flexGrow: 1 - split }}>
				<PaneB logs={state.logs} />
			</box>
		</box>
	);
};
