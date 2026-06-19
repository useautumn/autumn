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
 * The orchestrator mutates the shared `store`; this app reads it live on a ~10fps
 * tick (mutable-state + interval flush) to keep updates cheap and flicker-free.
 */

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

const elide = (text: string, max: number): string => {
	if (max <= 1 || text.length <= max) {
		return text;
	}
	return `${text.slice(0, max - 1)}…`;
};

const basename = (path: string): string => path.split("/").pop() ?? path;

const ProgressBar = ({
	label,
	done,
	total,
	width = 28,
	color = COLOR.accent,
}: {
	label: string;
	done: number;
	total: number;
	width?: number;
	color?: string;
}) => {
	const ratio = total > 0 ? Math.min(1, done / total) : 0;
	const filled = Math.round(ratio * width);
	const bar = "▰".repeat(filled) + "▱".repeat(Math.max(0, width - filled));
	return (
		<box style={{ flexDirection: "row", gap: 1 }}>
			<text style={{ fg: COLOR.dim }}>{label.padEnd(9)}</text>
			<text style={{ fg: color }}>{bar}</text>
			<text style={{ fg: COLOR.dim }}>
				{done}/{total}
			</text>
		</box>
	);
};

const Header = ({ state }: { state: TuiState }) => (
	<box style={{ flexDirection: "row", gap: 1 }}>
		<text style={{ fg: COLOR.accent }}>swarm</text>
		<text style={{ fg: COLOR.text }}>{state.target || "core"}</text>
		<text style={{ fg: COLOR.dim }}>·</text>
		<text style={{ fg: COLOR.dim }}>{state.workers} workers</text>
		<text style={{ fg: COLOR.dim }}>·</text>
		<text style={{ fg: COLOR.cyan }}>{state.phase}</text>
	</box>
);

const RunningFile = ({ file, frame }: { file: TuiTestFile; frame: string }) => {
	const color = file.status === "retrying" ? COLOR.yellow : COLOR.cyan;
	const counts = `(✓${file.passed} ✗${file.failed})`;
	const current = file.currentTest ? ` › ${file.currentTest}` : "";
	return (
		<box style={{ flexDirection: "row", gap: 1 }}>
			<text style={{ fg: color }}>{frame}</text>
			<text style={{ fg: COLOR.text }}>
				{elide(`${basename(file.file)} ${counts}${current}`, 70)}
			</text>
		</box>
	);
};

const CompletedFile = ({ file }: { file: TuiTestFile }) => {
	if (file.status === "passed") {
		const tag = file.passedOnRetry ? " (passed on retry)" : "";
		return (
			<text style={{ fg: COLOR.dim }}>
				✓ {basename(file.file)} (✓{file.passed}){tag}
			</text>
		);
	}
	return (
		<text style={{ fg: COLOR.red }}>
			✗ {basename(file.file)} (✓{file.passed} ✗{file.failed})
		</text>
	);
};

const RunView = ({ state }: { state: TuiState }) => {
	const t = runTallies();
	const files = Array.from(state.files.values());
	const running = files.filter(
		(f) => f.status === "running" || f.status === "retrying",
	);
	const completed = files.filter(
		(f) => f.status === "passed" || f.status === "failed",
	);
	const frame = SPINNER[Math.floor(Date.now() / 80) % SPINNER.length] ?? "⠋";
	return (
		<box style={{ flexDirection: "column", gap: 0 }}>
			<ProgressBar
				color={COLOR.green}
				done={t.done}
				label="tests"
				total={state.runTotal}
			/>
			<box style={{ flexDirection: "row", gap: 2 }}>
				<text style={{ fg: COLOR.green }}>✓ {t.passed}</text>
				<text style={{ fg: COLOR.red }}>✗ {t.failed}</text>
				<text style={{ fg: COLOR.cyan }}>{t.running} running</text>
				<text style={{ fg: COLOR.yellow }}>{t.retrying} retrying</text>
			</box>
			<scrollbox
				scrollY={true}
				stickyScroll={false}
				style={{ flexGrow: 1, flexDirection: "column" }}
			>
				{running.map((f) => (
					<RunningFile file={f} frame={frame} key={`run-${f.file}`} />
				))}
				{completed.map((f) => (
					<CompletedFile file={f} key={`done-${f.file}`} />
				))}
			</scrollbox>
		</box>
	);
};

const SummaryView = ({ state }: { state: TuiState }) => {
	const s = state.summary;
	if (!s) {
		return <text style={{ fg: COLOR.dim }}>finishing…</text>;
	}
	const allPassed = s.failed === 0 && s.crashed === 0;
	const sec = (s.wallMs / 1000).toFixed(0);
	return (
		<scrollbox scrollY={true} style={{ flexGrow: 1, flexDirection: "column" }}>
			<text style={{ fg: allPassed ? COLOR.green : COLOR.red }}>
				{allPassed
					? `✓ ALL ${s.passed} TESTS PASSED`
					: `FAILED — ${s.failed} failed, ${s.crashed} crashed, ${s.passed} passed`}
			</text>
			<text style={{ fg: COLOR.text }}>
				wall-clock {Math.floor(Number(sec) / 60)}m{Number(sec) % 60}s
			</text>
			{s.costLine ? <text style={{ fg: COLOR.cyan }}>{s.costLine}</text> : null}
			{s.logFile ? (
				<text style={{ fg: COLOR.dim }}>full run log: {s.logFile}</text>
			) : null}
			<text style={{ fg: COLOR.dim }}>{"─".repeat(40)}</text>
			{Array.from(state.files.values())
				.filter((f) => f.status === "failed")
				.map((f) => (
					<box
						key={`fail-${f.file}`}
						style={{ flexDirection: "column", marginTop: 1 }}
					>
						<text style={{ fg: COLOR.red }}>📁 {basename(f.file)}</text>
						{f.failedTests.map((test, index) => (
							<box
								key={`${f.file}-${test.name}-${index}`}
								style={{ flexDirection: "column" }}
							>
								<text style={{ fg: COLOR.red }}> ✗ {test.name}</text>
								{test.location ? (
									<text style={{ fg: COLOR.cyan }}> {test.location}</text>
								) : null}
								{test.message ? (
									<text style={{ fg: COLOR.yellow }}>
										{elide(` ${test.message}`, 76)}
									</text>
								) : null}
							</box>
						))}
					</box>
				))}
		</scrollbox>
	);
};

const PaneA = ({ state, frame }: { state: TuiState; frame: string }) => (
	<box style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
		<Header state={state} />
		<text style={{ fg: COLOR.dim }}>{"─".repeat(40)}</text>
		{state.phase === "warm" ? (
			<box style={{ flexDirection: "row", gap: 1 }}>
				<text style={{ fg: COLOR.cyan }}>{frame}</text>
				<text style={{ fg: COLOR.text }}>
					{state.warmBuilding ? "building warm parent" : "warming"}:{" "}
					{elide(state.warmActivity || "…", 60)}
				</text>
			</box>
		) : null}
		{state.phase === "fanout" ? (
			<box style={{ flexDirection: "column" }}>
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
		{state.phase === "run" ? <RunView state={state} /> : null}
		{state.phase === "teardown" ? (
			<box style={{ flexDirection: "column" }}>
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
		{state.phase === "done" ? <SummaryView state={state} /> : null}
	</box>
);

const PaneB = ({ logs }: { logs: string[] }) => (
	<scrollbox
		focusable={true}
		scrollY={true}
		stickyScroll={true}
		stickyStart="bottom"
		style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}
	>
		{logs.slice(-1000).map((line, index) => (
			<text key={`log-${index}`} style={{ fg: COLOR.dim }}>
				{line}
			</text>
		))}
	</scrollbox>
);

export const App = () => {
	const [, setTick] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => setTick((n) => n + 1), 100);
		return () => clearInterval(interval);
	}, []);

	const state = getTuiState();
	const frame = SPINNER[Math.floor(Date.now() / 80) % SPINNER.length] ?? "⠋";

	// Responsive: split along the longer axis. Terminals are usually wide, so a
	// vertical divider (row layout) is the common case; stack when narrow.
	const dims =
		typeof process.stdout.columns === "number"
			? { w: process.stdout.columns, h: process.stdout.rows ?? 24 }
			: { w: 120, h: 30 };
	const wide = dims.w >= 100;

	return (
		<box
			style={{
				width: "100%",
				height: "100%",
				flexDirection: wide ? "row" : "column",
			}}
		>
			<box style={{ flexGrow: 1, flexDirection: "column" }}>
				<PaneA frame={frame} state={state} />
			</box>
			<box
				style={
					wide
						? { width: 1, height: "100%", backgroundColor: COLOR.dim }
						: { width: "100%", height: 1, backgroundColor: COLOR.dim }
				}
			/>
			<box style={{ flexGrow: 1, flexDirection: "column" }}>
				<PaneB logs={state.logs} />
			</box>
		</box>
	);
};
