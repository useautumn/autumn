"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export const COUNTS = [1, 10, 100, 1000] as const;

export function formatCount(n: number) {
	return n.toLocaleString("en-US");
}

export function formatMs(ms: number) {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
}

// Drives an update "run": progress 0→1 over a wall-clock window (compressed for
// large N), exposing the projected DB time and rows done. Interruptible.
export function useUpdateRun({
	rows,
	perRowMs,
}: {
	rows: number;
	perRowMs: number;
}) {
	const reduce = useReducedMotion();
	const [progress, setProgress] = useState(0);
	const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
	const frame = useRef<number | null>(null);

	const stop = useCallback(() => {
		if (frame.current !== null) {
			cancelAnimationFrame(frame.current);
			frame.current = null;
		}
	}, []);

	const reset = useCallback(() => {
		stop();
		setProgress(0);
		setStatus("idle");
	}, [stop]);

	const start = useCallback(() => {
		stop();
		setStatus("running");
		if (reduce) {
			setProgress(1);
			setStatus("done");
			return;
		}
		const duration = Math.min(Math.max(rows * 8, 400), 2500);
		const startedAt = performance.now();
		const tick = (now: number) => {
			const p = Math.min((now - startedAt) / duration, 1);
			setProgress(p);
			if (p < 1) {
				frame.current = requestAnimationFrame(tick);
			} else {
				setStatus("done");
			}
		};
		frame.current = requestAnimationFrame(tick);
	}, [reduce, rows, stop]);

	useEffect(() => stop, [stop]);

	const rowsDone = Math.floor(progress * rows);
	const projectedMs = rows * perRowMs;
	const elapsedMs = progress * projectedMs;

	return { progress, status, rowsDone, projectedMs, elapsedMs, start, reset };
}

// Single-select count pills, styled like the toggle pills.
export function CountSelector({
	value,
	onSelect,
	disabled,
}: {
	value: number;
	onSelect: (n: number) => void;
	disabled?: boolean;
}) {
	return (
		<div className="flex items-center gap-1">
			<span className="mr-1 font-mono text-[11px] text-[#FFFFFF4d]">
				customers
			</span>
			{COUNTS.map((n) => (
				<button
					key={n}
					type="button"
					disabled={disabled}
					onClick={() => onSelect(n)}
					aria-pressed={value === n}
					className={cn(
						"rounded-md border px-2 py-px font-mono text-[12px] transition duration-200 active:scale-[0.97] disabled:opacity-50",
						value === n
							? "border-[#9564ff] bg-[#9564ff26] text-white"
							: "border-[#2c2c2c] bg-[#161616] text-[#FFFFFF80] hover:border-[#3a3a3a] hover:bg-[#1c1c1c] hover:text-white",
					)}
				>
					{formatCount(n)}
				</button>
			))}
		</div>
	);
}

export function RunPill({
	onClick,
	disabled,
	children,
}: {
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="relative inline-flex items-center gap-1 overflow-hidden rounded-md border border-[#6d28d9] bg-[#6d28d9] px-2 py-1 font-sans text-[12px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition duration-200 after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent_55%)] hover:bg-[#7c3aed] active:scale-[0.98] disabled:opacity-50"
		>
			<svg
				width="8"
				height="8"
				viewBox="0 0 16 16"
				fill="currentColor"
				aria-hidden="true"
				className="relative z-10 shrink-0"
			>
				<path d="M4 3l9 5-9 5z" />
			</svg>
			<span className="relative z-10">{children}</span>
		</button>
	);
}

// Section label bar matching the relational widget.
export function SectionLabel({
	children,
	className,
}: {
	children: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"bg-[#141414] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[#9564ff]",
				className,
			)}
		>
			{children}
		</div>
	);
}
