"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDiagramWidth } from "./useDiagramWidth";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ENTER = { duration: 0.28, ease: EASE_OUT };

const W = 660;
const H = 456;
const STACK = 12;
const MAX_AGENTS = 5;
const MAX_OFFSET = (MAX_AGENTS - 1) * STACK;

const PORTLESS = { x: 16, y: 16, w: 196, h: 44 };
const TUNNEL = { x: 232, y: 16, w: 196, h: 44 };
const INFISICAL = { x: 448, y: 16, w: 196, h: 44 };

const AGENT = { x: 16, y: 92, w: 284, h: 296 };
const SHARED_BOX = { x: 360, y: 92, w: 284, h: 296 };

const DOCKER = [
	{ name: "Postgres", detail: "Drizzle migrations" },
	{ name: "Cache", detail: "Dragonfly" },
	{ name: "SQS", detail: "ElasticMQ" },
	{ name: "DynamoDB", detail: "dynoxide" },
] as const;

const SHARED_SERVICES = [
	{ name: "Axiom", detail: "logs · traces" },
	{ name: "Stripe", detail: "billing sandbox" },
	{ name: "Tinybird", detail: "analytics" },
	{ name: "Amazon S3", detail: "storage" },
	{ name: "Trigger.dev", detail: "background jobs" },
] as const;

type Point = { x: number; y: number };

function pathD(from: Point, to: Point) {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	if (Math.abs(dx) >= Math.abs(dy)) {
		const c = Math.max(Math.abs(dx) * 0.5, 24) * Math.sign(dx || 1);
		return `M ${from.x} ${from.y} C ${from.x + c} ${from.y}, ${to.x - c} ${to.y}, ${to.x} ${to.y}`;
	}
	const c = Math.max(Math.abs(dy) * 0.5, 24) * Math.sign(dy || 1);
	return `M ${from.x} ${from.y} C ${from.x} ${from.y + c}, ${to.x} ${to.y - c}, ${to.x} ${to.y}`;
}

function Connector({
	from,
	to,
	active,
	reduce,
}: {
	from: Point;
	to: Point;
	active: boolean;
	reduce: boolean | null;
}) {
	const d = pathD(from, to);
	const color = active ? "#9564ff" : "#2c2c2c";
	return (
		<g style={{ opacity: active ? 1 : 0.5 }}>
			<motion.path
				animate={
					active && !reduce
						? { strokeDashoffset: [0, -20] }
						: { strokeDashoffset: 0 }
				}
				d={d}
				fill="none"
				stroke={color}
				strokeDasharray="4 6"
				strokeLinecap="round"
				strokeWidth={1.5}
				transition={
					active && !reduce
						? {
								duration: 0.7,
								ease: "linear",
								repeat: Number.POSITIVE_INFINITY,
							}
						: { duration: 0.2 }
				}
			/>
			<circle cx={from.x} cy={from.y} fill={color} r={2.5} />
			<circle cx={to.x} cy={to.y} fill={color} r={2.5} />
		</g>
	);
}

function Chip({ name, detail }: { name: string; detail?: string }) {
	return (
		<div className="min-w-0 shrink-0 rounded-md border border-[#292929] bg-[#0F0F0F] px-2 py-1.5 leading-[14px]">
			<div className="truncate font-mono text-[11px] text-[#E5E5E5]">
				{name}
			</div>
			{detail ? (
				<div className="truncate font-mono text-[10px] text-[#FFFFFF66]">
					{detail}
				</div>
			) : null}
		</div>
	);
}

function Card({
	active = false,
	compact = false,
	label,
	detail,
	children,
}: {
	active?: boolean;
	compact?: boolean;
	label: string;
	detail?: string;
	children?: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex h-full w-full flex-col rounded-lg border px-3",
				compact ? "justify-center py-0" : "py-2.5",
				active
					? "border-[#9564ff] bg-[#0F0F0F] shadow-[0_0_0_1px_#9564ff40]"
					: "border-[#292929] bg-[#141414]",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="min-w-0">
					<div
						className={cn(
							"truncate font-mono text-[11px] uppercase tracking-[0.08em]",
							active ? "text-[#dcc4ff]" : "text-[#FFFFFF66]",
						)}
					>
						{label}
					</div>
					{detail ? (
						<div className="truncate font-mono text-[10px] text-[#FFFFFF66]">
							{detail}
						</div>
					) : null}
				</div>
				<span
					className={cn(
						"h-1.5 w-1.5 shrink-0 rounded-full",
						active ? "bg-[#9564ff]" : "bg-[#3a3a3a]",
					)}
				/>
			</div>
			{children ? <div className="mt-2 min-h-0 flex-1">{children}</div> : null}
		</div>
	);
}

function AgentBody() {
	return (
		<div className="flex h-full flex-col gap-1.5">
			<Chip detail="Bun · API + workers" name="Autumn API" />
			<fieldset className="m-0 min-w-0 rounded-md border border-[#302a38] px-1.5 pb-1.5 pt-1">
				<legend className="px-1 font-mono text-[9px] uppercase leading-3 tracking-[0.08em] text-[#9b8baa]">
					Docker Compose
				</legend>
				<div className="grid grid-cols-2 gap-1.5">
					{DOCKER.map((service) => (
						<Chip
							detail={service.detail}
							key={service.name}
							name={service.name}
						/>
					))}
				</div>
			</fieldset>
			<Chip detail="emulate.dev" name="Google OAuth" />
		</div>
	);
}

export function AgentEnvironmentDiagram() {
	const reduce = useReducedMotion();
	const [count, setCount] = useState(1);
	const [zoomed, setZoomed] = useState(false);
	const { ref: viewportRef, width } = useDiagramWidth();
	const fits = width !== null && width < W;
	let scale = 1;
	if (fits && !zoomed) scale = width / W;
	const stacked = count > 1;
	const offset = (count - 1) * STACK;

	return (
		<figure
			aria-label="Each cloud agent gets its own isolated environment, reached via Portless, Cloudflare Tunnel, and Infisical. Shared services stay as one set."
			className="not-prose my-8 overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]"
		>
			<div className="flex flex-wrap items-center gap-2 border-b border-[#292929] px-4 py-2.5">
				<span className="font-mono text-[11px] text-[#FFFFFF4d]">
					{count} {count === 1 ? "agent" : "agents"}
				</span>
				<AnimatePresence>
					{stacked && (
						<motion.button
							animate={{ opacity: 1 }}
							className="font-mono text-[12px] text-[#FFFFFF66] transition-colors duration-200 hover:text-white"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onClick={() => setCount(1)}
							transition={ENTER}
							type="button"
						>
							Reset
						</motion.button>
					)}
				</AnimatePresence>
				<div className="ml-auto">
					<button
						className="relative inline-flex items-center gap-1 overflow-hidden rounded-md border border-[#6d28d9] bg-[#6d28d9] px-2 py-1 font-sans text-[12px] font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition duration-200 after:pointer-events-none after:absolute after:inset-0 after:bg-[linear-gradient(135deg,rgba(255,255,255,0.14),transparent_55%)] hover:bg-[#7c3aed] active:scale-[0.98] disabled:opacity-50"
						disabled={count >= MAX_AGENTS}
						onClick={() =>
							setCount((current) => Math.min(current + 1, MAX_AGENTS))
						}
						type="button"
					>
						<svg
							aria-hidden="true"
							className="relative z-10 shrink-0"
							fill="currentColor"
							height="8"
							viewBox="0 0 16 16"
							width="8"
						>
							<path d="M4 3l9 5-9 5z" />
						</svg>
						<span className="relative z-10">Spin up agent</span>
					</button>
				</div>
			</div>

			<div className="px-3 py-3 sm:px-4 sm:py-4">
				<div
					ref={viewportRef}
					className="overflow-x-auto overscroll-x-contain"
					tabIndex={zoomed && fits ? 0 : undefined}
				>
					<div
						className="relative mx-auto"
						style={{ width: W * scale, height: H * scale }}
					>
						<div
							className="absolute left-0 top-0 origin-top-left"
							style={{
								width: W,
								height: H,
								transform: `scale(${scale})`,
								visibility: width === null ? "hidden" : "visible",
							}}
						>
							<svg
								aria-hidden="true"
								className="pointer-events-none absolute inset-0"
								fill="none"
								height={H}
								viewBox={`0 0 ${W} ${H}`}
								width={W}
							>
								<title>connectors</title>
								<Connector
									active
									from={{
										x: PORTLESS.x + PORTLESS.w,
										y: PORTLESS.y + PORTLESS.h / 2,
									}}
									reduce={reduce}
									to={{ x: TUNNEL.x, y: TUNNEL.y + TUNNEL.h / 2 }}
								/>
								<Connector
									active
									from={{
										x: TUNNEL.x + TUNNEL.w,
										y: TUNNEL.y + TUNNEL.h / 2,
									}}
									reduce={reduce}
									to={{ x: INFISICAL.x, y: INFISICAL.y + INFISICAL.h / 2 }}
								/>
								<Connector
									active
									from={{
										x: TUNNEL.x + TUNNEL.w / 2,
										y: TUNNEL.y + TUNNEL.h,
									}}
									reduce={reduce}
									to={{
										x: AGENT.x + AGENT.w / 2 + offset,
										y: AGENT.y + offset,
									}}
								/>
								<Connector
									active
									from={{
										x: AGENT.x + AGENT.w + offset,
										y: AGENT.y + 48 + offset,
									}}
									reduce={reduce}
									to={{ x: SHARED_BOX.x, y: AGENT.y + 48 + offset }}
								/>
							</svg>

							<div
								className="absolute"
								style={{
									left: PORTLESS.x,
									top: PORTLESS.y,
									width: PORTLESS.w,
									height: PORTLESS.h,
								}}
							>
								<Card compact detail="*.localhost" label="Portless" />
							</div>
							<div
								className="absolute"
								style={{
									left: TUNNEL.x,
									top: TUNNEL.y,
									width: TUNNEL.w,
									height: TUNNEL.h,
								}}
							>
								<Card
									active
									compact
									detail="public HTTPS"
									label="Cloudflare Tunnel"
								/>
							</div>
							<div
								className="absolute"
								style={{
									left: INFISICAL.x,
									top: INFISICAL.y,
									width: INFISICAL.w,
									height: INFISICAL.h,
								}}
							>
								<Card compact detail="secrets" label="Infisical" />
							</div>

							<div
								className="absolute"
								style={{
									left: AGENT.x,
									top: AGENT.y,
									width: AGENT.w + MAX_OFFSET,
									height: AGENT.h + MAX_OFFSET,
								}}
							>
								{Array.from({ length: count - 1 }, (_, index) => (
									<div
										aria-hidden="true"
										className="absolute rounded-lg border border-[#39323f] bg-[#141414]"
										key={`agent-back-${index + 1}`}
										style={{
											left: index * STACK,
											top: index * STACK,
											width: AGENT.w,
											height: AGENT.h,
										}}
									/>
								))}
								<motion.div
									animate={{ x: offset, y: offset }}
									initial={false}
									transition={reduce ? { duration: 0 } : ENTER}
									className="absolute left-0 top-0"
									style={{ width: AGENT.w, height: AGENT.h, zIndex: 2 }}
								>
									<Card
										active={stacked}
										label={`agent ${String(count).padStart(2, "0")}`}
									>
										<AgentBody />
									</Card>
								</motion.div>
							</div>

							<div
								className="absolute"
								style={{
									left: SHARED_BOX.x,
									top: SHARED_BOX.y,
									width: SHARED_BOX.w,
									height: SHARED_BOX.h,
								}}
							>
								<Card label="shared">
									<div className="grid h-full grid-rows-5 gap-1.5">
										{SHARED_SERVICES.map((service) => (
											<Chip
												detail={service.detail}
												key={service.name}
												name={service.name}
											/>
										))}
									</div>
								</Card>
							</div>
						</div>
					</div>
				</div>
			</div>
			{fits && (
				<div className="flex items-center justify-between gap-3 border-t border-[#292929] px-3 py-2 text-[11px] text-[#999]">
					<span>
						{zoomed
							? "Swipe to explore the diagram"
							: "Each agent is isolated · services stay shared"}
					</span>
					<button
						type="button"
						aria-pressed={zoomed}
						onClick={() => setZoomed((current) => !current)}
						className="min-h-9 shrink-0 rounded-md border border-[#39313f] px-3 text-[#cbb4e3] hover:bg-[#211927] focus-visible:outline-2 focus-visible:outline-[#9564ff]"
					>
						{zoomed ? "Fit diagram" : "Zoom in"}
					</button>
				</div>
			)}
		</figure>
	);
}
