import { toast } from "sonner";
import React from "react";

let buffer: Array<{ label: string; ms: number }> = [];
const starts = new Map<string, number>();

const STORAGE_KEY = "autumn:perf:pending";

/** Start measuring a span. Idempotent on duplicate-label (last-write-wins). */
export function startSpan(label: string): void {
	if (starts.has(label)) {
		console.warn(
			`[perfTrace] startSpan called again for "${label}" — overwriting previous start`,
		);
	}
	console.time(label);
	starts.set(label, performance.now());
}

/** End a span, push {label, ms} to the in-memory buffer, and console.timeEnd.
 * Safe to call without a matching start (no-op, console.warn). */
export function endSpan(label: string): void {
	const start = starts.get(label);
	if (start === undefined) {
		console.warn(
			`[perfTrace] endSpan called for "${label}" with no matching startSpan`,
		);
		return;
	}
	const ms = performance.now() - start;
	console.timeEnd(label);
	buffer.push({ label, ms });
	starts.delete(label);
}

/** Wrapper: console.time + try/finally console.timeEnd. Returns whatever fn returns. */
export async function traceAsync<T>(
	label: string,
	fn: () => Promise<T>,
): Promise<T> {
	startSpan(label);
	try {
		return await fn();
	} finally {
		endSpan(label);
	}
}

/** Flush in-memory buffer + a reload-start timestamp to localStorage,
 * keyed under "autumn:perf:pending". Call this RIGHT BEFORE window.location.reload(). */
export function flushBeforeReload(flowId: string): void {
	const payload = {
		flowId,
		reloadStartedAt: Date.now(),
		measurements: [...buffer],
	};
	console.log(
		`[perfTrace] flushBeforeReload(${flowId}) — buffering ${buffer.length} measurements:`,
		buffer,
	);
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch (err) {
		console.error("[perfTrace] flushBeforeReload localStorage write failed:", err);
	}
	buffer = [];
	starts.clear();
}

/** On app boot: read localStorage, compute reloadAndBoot delta if pending,
 * emit sonner toast with all measurements, then clear localStorage.
 * Safe to call multiple times — no-op when nothing pending.
 * Returns true if a toast was shown, false otherwise. */
export function restoreAndAlertIfPending(): boolean {
	console.log("[perfTrace] restoreAndAlertIfPending() invoked");
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(STORAGE_KEY);
	} catch (err) {
		console.error("[perfTrace] localStorage read failed:", err);
		return false;
	}

	if (!raw) {
		console.log("[perfTrace] no pending benchmark in localStorage — nothing to do");
		return false;
	}

	let parsed: {
		flowId?: string;
		reloadStartedAt?: number;
		measurements?: Array<{ label: string; ms: number }>;
	};

	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		console.error("[perfTrace] failed to parse pending benchmark JSON:", err);
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {}
		return false;
	}

	const reloadStartedAt = parsed.reloadStartedAt;
	const measurements = parsed.measurements;

	if (typeof reloadStartedAt !== "number" || !Array.isArray(measurements)) {
		console.warn("[perfTrace] pending benchmark has invalid shape:", parsed);
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {}
		return false;
	}

	const reloadAndBootMs = Date.now() - reloadStartedAt;

	if (reloadAndBootMs > 60_000) {
		console.warn(
			`[perfTrace] pending benchmark is stale (${reloadAndBootMs}ms old) — discarding`,
		);
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {}
		return false;
	}

	const allMeasurements = [
		...measurements,
		{ label: "impersonate.reloadAndBoot", ms: reloadAndBootMs },
	];

	const maxLabelLength = Math.max(
		...allMeasurements.map((m) => m.label.length),
	);
	const lines = allMeasurements.map(
		(m) => `${m.label.padEnd(maxLabelLength)}  ${m.ms.toFixed(1)}ms`,
	);
	const totalMs = allMeasurements.reduce((sum, m) => sum + m.ms, 0);

	const maxMsStringLength = Math.max(
		...allMeasurements.map((m) => `${m.ms.toFixed(1)}ms`.length),
	);
	const divider = `${"".padEnd(maxLabelLength)}  ${"-".repeat(maxMsStringLength)}`;
	const totalLine = `${"total:".padEnd(maxLabelLength)}  ${totalMs.toFixed(1)}ms`;

	const description = [...lines, divider, totalLine].join("\n");

	// Always dump to console first — guaranteed visibility even if the toast is missed.
	console.group("[perfTrace] Impersonation benchmark");
	console.table(allMeasurements);
	console.log(description);
	console.log(`total: ${totalMs.toFixed(1)}ms`);
	console.groupEnd();

	// Clear localStorage immediately so a refresh doesn't repeat the toast.
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {}

	// Defer the toast call — the <CustomToaster /> is mounted inside MainLayout
	// which mounts AFTER App's first useEffect fires. A short delay lets the
	// layout subtree finish mounting so sonner has a host to render into.
	setTimeout(() => {
		try {
			toast.message("Impersonation benchmark", {
				description: React.createElement(
					"pre",
					{ className: "text-xs whitespace-pre font-mono" },
					description,
				),
				duration: 30000,
			});
		} catch (err) {
			console.error("[perfTrace] toast.message failed:", err);
		}
	}, 200);

	return true;
}
