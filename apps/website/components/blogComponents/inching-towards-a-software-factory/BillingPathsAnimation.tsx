"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const STATES = [
	"Free · limited usage",
	"Trial · paid plan",
	"Pro · 10 seats",
	"Pro · overages enabled",
	"Annual · prepaid credits",
	"Pro · tiered usage",
] as const;

const ACTIONS = [
	"Upgrade",
	"Downgrade",
	"Change seats",
	"End billing cycle",
	"Record usage",
] as const;

const OUTCOMES = [
	"Prorated invoice",
	"Credit applied",
	"Entitlements updated",
	"Overage invoice",
	"Change scheduled",
	"Usage blocked",
] as const;

type Path = { state: number; action: number; outcome: number };

const DEFAULT_PATH: Path = { state: 3, action: 3, outcome: 3 };
const DRAW_S = 0.42;
const STAGGER_S = 0.38;
const DELAYS = [0, STAGGER_S, STAGGER_S * 2] as const;
const DRAW_MS = (STAGGER_S * 2 + DRAW_S) * 1000;
const HOLD_MS = 900;
const CYCLE_MS = DRAW_MS + HOLD_MS;

const CANVAS = { w: 680, h: 292 };
const NODE = { h: 28, pitch: 40, top: 44 };
const STATE = { x: 8, w: 172 };
const ACTION = { x: 228, w: 132 };
const STRIPE = { x: 404, y: 110, w: 84, h: 72 };
const OUTCOME = { x: 524, w: 148 };

function columnY(index: number, count: number) {
	const block = (count - 1) * NODE.pitch + NODE.h;
	const top = NODE.top + (5 * NODE.pitch + NODE.h - block) / 2;
	return top + index * NODE.pitch;
}

function midY(index: number, count: number) {
	return columnY(index, count) + NODE.h / 2;
}

function curve(x1: number, y1: number, x2: number, y2: number) {
	const c = (x2 - x1) * 0.5;
	return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
}

function randInt(n: number) {
	return Math.floor(Math.random() * n);
}

function randomPath(avoid?: Path): Path {
	let next: Path = {
		state: randInt(STATES.length),
		action: randInt(ACTIONS.length),
		outcome: randInt(OUTCOMES.length),
	};
	if (
		avoid &&
		next.state === avoid.state &&
		next.action === avoid.action &&
		next.outcome === avoid.outcome
	) {
		next = {
			state: (next.state + 1) % STATES.length,
			action: next.action,
			outcome: next.outcome,
		};
	}
	return next;
}

function useCanvasScale() {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		const update = () => {
			const width = el.clientWidth;
			if (width > 0) setScale(width / CANVAS.w);
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return { ref, scale };
}

function useBillingPath({ animate }: { animate: boolean }) {
	const [path, setPath] = useState<Path>(DEFAULT_PATH);
	const [phase, setPhase] = useState(3);
	const pathKey = `${path.state}-${path.action}-${path.outcome}`;

	useEffect(() => {
		void pathKey;
		if (!animate) {
			setPhase(3);
			return;
		}
		setPhase(0);
		const timers = [
			window.setTimeout(() => setPhase(1), DRAW_S * 1000),
			window.setTimeout(() => setPhase(2), (STAGGER_S + DRAW_S) * 1000),
			window.setTimeout(() => setPhase(3), DRAW_MS),
		];
		return () => {
			for (const timer of timers) window.clearTimeout(timer);
		};
	}, [animate, pathKey]);

	const selectState = (state: number) =>
		setPath((current) => ({ ...current, state }));
	const selectAction = (action: number) =>
		setPath((current) => ({ ...current, action }));
	const selectOutcome = (outcome: number) =>
		setPath((current) => ({ ...current, outcome }));

	useEffect(() => {
		const id = window.setInterval(() => {
			setPath((current) => randomPath(current));
		}, CYCLE_MS);
		return () => window.clearInterval(id);
	}, []);

	return { path, phase, selectState, selectAction, selectOutcome };
}

function dimMesh() {
	const paths: string[] = [];
	const stripeIn = { x: STRIPE.x, y: STRIPE.y + STRIPE.h / 2 };
	const stripeOut = {
		x: STRIPE.x + STRIPE.w,
		y: STRIPE.y + STRIPE.h / 2,
	};

	for (let s = 0; s < STATES.length; s++) {
		for (let a = 0; a < ACTIONS.length; a++) {
			paths.push(
				curve(
					STATE.x + STATE.w,
					midY(s, STATES.length),
					ACTION.x,
					midY(a, ACTIONS.length),
				),
			);
		}
	}
	for (let a = 0; a < ACTIONS.length; a++) {
		paths.push(
			curve(
				ACTION.x + ACTION.w,
				midY(a, ACTIONS.length),
				stripeIn.x,
				stripeIn.y,
			),
		);
	}
	for (let o = 0; o < OUTCOMES.length; o++) {
		paths.push(
			curve(stripeOut.x, stripeOut.y, OUTCOME.x, midY(o, OUTCOMES.length)),
		);
	}
	return paths;
}

const DIM = dimMesh();

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function ActiveConnector({
	from,
	to,
	reduce,
	delay,
}: {
	from: { x: number; y: number };
	to: { x: number; y: number };
	reduce: boolean;
	delay: number;
}) {
	const d = curve(from.x, from.y, to.x, to.y);
	const drawn = { pathLength: 1, opacity: 1 };
	const hidden = reduce ? drawn : { pathLength: 0, opacity: 0 };
	return (
		<g>
			<motion.path
				animate={drawn}
				d={d}
				fill="none"
				initial={hidden}
				stroke="#9564ff"
				strokeLinecap="round"
				strokeWidth={1.5}
				transition={{ delay, duration: DRAW_S, ease: EASE_OUT }}
			/>
			<motion.path
				animate={
					reduce
						? drawn
						: { pathLength: 1, opacity: 1, strokeDashoffset: [0, -20] }
				}
				d={d}
				fill="none"
				initial={hidden}
				stroke="#b08aff"
				strokeDasharray="4 6"
				strokeLinecap="round"
				strokeWidth={1.5}
				transition={
					reduce
						? { delay, duration: DRAW_S, ease: EASE_OUT }
						: {
								pathLength: { delay, duration: DRAW_S, ease: EASE_OUT },
								opacity: { delay, duration: DRAW_S, ease: EASE_OUT },
								strokeDashoffset: {
									delay: delay + DRAW_S,
									duration: 0.7,
									ease: "linear",
									repeat: Number.POSITIVE_INFINITY,
								},
							}
				}
			/>
			<motion.circle
				animate={{ opacity: 1 }}
				cx={from.x}
				cy={from.y}
				fill="#b08aff"
				initial={{ opacity: reduce ? 1 : 0 }}
				r={2.5}
				transition={{ delay, duration: 0.2 }}
			/>
			<motion.circle
				animate={{ opacity: 1 }}
				cx={to.x}
				cy={to.y}
				fill="#b08aff"
				initial={{ opacity: reduce ? 1 : 0 }}
				r={2.5}
				transition={{ delay: delay + DRAW_S * 0.76, duration: 0.2 }}
			/>
		</g>
	);
}

function Chip({
	label,
	active,
	onSelect,
	x,
	y,
	w,
}: {
	label: string;
	active: boolean;
	onSelect: () => void;
	x: number;
	y: number;
	w: number;
}) {
	return (
		<button
			aria-pressed={active}
			className={cn(
				"absolute z-10 truncate rounded-lg border px-3 text-left font-sans text-[11px] leading-[26px] transition duration-200 active:scale-[0.98]",
				active
					? "border-[#9564ff] bg-[#1a1329] text-white shadow-[0_0_0_1px_#9564ff55]"
					: "border-[#292929] bg-[#141414] text-[#c8c8c8] hover:border-[#3a3a3a] hover:text-white",
			)}
			onClick={onSelect}
			style={{ left: x, top: y, width: w, height: NODE.h }}
			type="button"
		>
			{label}
		</button>
	);
}

function ColumnHeader({ label, x }: { label: string; x: number }) {
	return (
		<div
			className="absolute z-10 font-mono text-[9px] tracking-[0.14em] text-[#FFFFFF4d] uppercase"
			style={{ left: x, top: 16 }}
		>
			{label}
		</div>
	);
}

export function BillingPathsAnimation() {
	const reduce = useReducedMotion() === true;
	const { ref, scale } = useCanvasScale();
	const { path, phase, selectState, selectAction, selectOutcome } =
		useBillingPath({ animate: !reduce });

	const stripeIn = { x: STRIPE.x, y: STRIPE.y + STRIPE.h / 2 };
	const stripeOut = {
		x: STRIPE.x + STRIPE.w,
		y: STRIPE.y + STRIPE.h / 2,
	};
	const fromState = {
		x: STATE.x + STATE.w,
		y: midY(path.state, STATES.length),
	};
	const toAction = { x: ACTION.x, y: midY(path.action, ACTIONS.length) };
	const fromAction = {
		x: ACTION.x + ACTION.w,
		y: midY(path.action, ACTIONS.length),
	};
	const toOutcome = {
		x: OUTCOME.x,
		y: midY(path.outcome, OUTCOMES.length),
	};

	const caption = `${STATES[path.state]}  →  ${ACTIONS[path.action]}  →  Stripe  →  ${OUTCOMES[path.outcome]}`;

	return (
		<figure
			aria-label="Customer states branching into actions and outcomes, with Stripe as a dependency. One path lights up at a time as the arrow reaches each box."
			className="not-prose my-8 overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]"
		>
			<div className="flex items-center gap-2 border-b border-[#292929] px-3 py-2.5 sm:px-4">
				<span className="font-mono text-[11px] text-[#FFFFFF4d]">path</span>
				<span className="min-w-0 truncate font-mono text-[11px] text-[#FFFFFF99]">
					{caption}
				</span>
			</div>

			<div className="w-full px-3 py-4 sm:px-4">
				<div
					className="relative w-full overflow-hidden"
					ref={ref}
					style={{ height: CANVAS.h * scale }}
				>
					<div
						className="absolute top-0 left-0 origin-top-left"
						style={{
							width: CANVAS.w,
							height: CANVAS.h,
							transform: `scale(${scale})`,
						}}
					>
						<svg
							aria-hidden="true"
							className="pointer-events-none absolute inset-0 z-0"
							fill="none"
							height={CANVAS.h}
							viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
							width={CANVAS.w}
						>
							<title>path connectors</title>
							<g stroke="#242424" strokeWidth={0.9}>
								{DIM.map((d) => (
									<path d={d} key={d} opacity={0.7} />
								))}
							</g>
							<ActiveConnector
								delay={DELAYS[0]}
								from={fromState}
								key={`${path.state}-${path.action}-a`}
								reduce={reduce}
								to={toAction}
							/>
							<ActiveConnector
								delay={DELAYS[1]}
								from={fromAction}
								key={`${path.action}-stripe-b`}
								reduce={reduce}
								to={stripeIn}
							/>
							<ActiveConnector
								delay={DELAYS[2]}
								from={stripeOut}
								key={`stripe-${path.outcome}-c`}
								reduce={reduce}
								to={toOutcome}
							/>
						</svg>

						<ColumnHeader label="Customer state" x={STATE.x} />
						<ColumnHeader label="Action" x={ACTION.x} />
						<ColumnHeader label="Outcome" x={OUTCOME.x} />

						{STATES.map((label, i) => (
							<Chip
								active={phase >= 0 && path.state === i}
								key={label}
								label={label}
								onSelect={() => selectState(i)}
								w={STATE.w}
								x={STATE.x}
								y={columnY(i, STATES.length)}
							/>
						))}
						{ACTIONS.map((label, i) => (
							<Chip
								active={phase >= 1 && path.action === i}
								key={label}
								label={label}
								onSelect={() => selectAction(i)}
								w={ACTION.w}
								x={ACTION.x}
								y={columnY(i, ACTIONS.length)}
							/>
						))}
						{OUTCOMES.map((label, i) => (
							<Chip
								active={phase >= 3 && path.outcome === i}
								key={label}
								label={label}
								onSelect={() => selectOutcome(i)}
								w={OUTCOME.w}
								x={OUTCOME.x}
								y={columnY(i, OUTCOMES.length)}
							/>
						))}

						<div
							className={cn(
								"absolute z-10 flex items-center justify-center rounded-lg border font-sans text-[14px] transition duration-200",
								phase >= 2
									? "border-[#9564ff] bg-[#1a1329] text-white shadow-[0_0_0_1px_#9564ff55]"
									: "border-[#292929] bg-[#141414] text-[#c8c8c8]",
							)}
							style={{
								left: STRIPE.x,
								top: STRIPE.y,
								width: STRIPE.w,
								height: STRIPE.h,
							}}
						>
							Stripe
						</div>
					</div>
				</div>
			</div>
		</figure>
	);
}
