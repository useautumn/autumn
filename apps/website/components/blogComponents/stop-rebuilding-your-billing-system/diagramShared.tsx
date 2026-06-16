"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Point = { x: number; y: number };

// Cubic bezier between two points; control points follow the dominant axis so
// horizontal and vertical connectors both curve naturally.
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

export function connectorPath(from: Point, to: Point) {
	return pathD(from, to);
}

export function Connector({
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
		<g style={{ opacity: active ? 1 : 0.55 }}>
			<motion.path
				d={d}
				fill="none"
				stroke={color}
				strokeWidth={1.5}
				strokeDasharray="4 6"
				strokeLinecap="round"
				animate={
					active && !reduce
						? { strokeDashoffset: [0, -20] }
						: { strokeDashoffset: 0 }
				}
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

export function NodeCard({
	x,
	y,
	w,
	h,
	active = false,
	muted = false,
	icon,
	title,
	subtitle,
	children,
}: {
	x: number;
	y: number;
	w: number;
	h: number;
	active?: boolean;
	muted?: boolean;
	icon?: ReactNode;
	title: string;
	subtitle?: string;
	children?: ReactNode;
}) {
	return (
		<div
			className={cn(
				"absolute flex flex-col justify-center rounded-lg border px-3 py-2 transition-all duration-200",
				active
					? "border-[#9564ff] bg-[#9564ff14] shadow-[0_0_0_1px_#9564ff55]"
					: "border-[#292929] bg-[#141414]",
				muted && "opacity-35",
			)}
			style={{ left: x, top: y, width: w, height: h }}
		>
			<span
				className={cn(
					"absolute top-2 right-2 h-1.5 w-1.5 rounded-full",
					active ? "bg-[#9564ff]" : "bg-[#3a3a3a]",
				)}
			/>
			<div className="flex items-center gap-2">
				{icon && (
					<span
						className={cn(
							"shrink-0",
							active ? "text-[#9564ff]" : "text-[#FFFFFF66]",
						)}
					>
						{icon}
					</span>
				)}
				<div className="min-w-0">
					<div className="truncate font-mono text-[12px] text-[#E5E5E5]">
						{title}
					</div>
					{subtitle && (
						<div
							className={cn(
								"truncate font-mono text-[11px]",
								active ? "text-[#9564ff]" : "text-[#FFFFFF66]",
							)}
						>
							{subtitle}
						</div>
					)}
				</div>
			</div>
			{children}
		</div>
	);
}

// Horizontally-scrollable fixed-coordinate canvas: nodes are absolutely
// positioned and an SVG overlay (same dimensions) carries the connectors.
export function DiagramCanvas({
	width,
	height,
	children,
	connectors,
	padClassName = "px-4 py-4",
}: {
	width: number;
	height: number;
	children: ReactNode;
	connectors: ReactNode;
	padClassName?: string;
}) {
	return (
		<div className={cn("overflow-x-auto", padClassName)}>
			<div className="relative mx-auto" style={{ width, height }}>
				<svg
					aria-hidden="true"
					className="absolute inset-0"
					fill="none"
					height={height}
					viewBox={`0 0 ${width} ${height}`}
					width={width}
				>
					<title>diagram connectors</title>
					{connectors}
				</svg>
				{children}
			</div>
		</div>
	);
}

const ICON_PROPS = {
	width: 13,
	height: 13,
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.4,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
};

export function IconDoc() {
	return (
		<svg {...ICON_PROPS} aria-hidden="true">
			<path d="M4 2h5l3 3v9H4z" />
			<path d="M9 2v3h3" />
		</svg>
	);
}

export function IconBranch() {
	return (
		<svg {...ICON_PROPS} aria-hidden="true">
			<path d="M8 2v12M3 5h10M3 5l2-2M3 5l2 2M13 5l-2-2M13 5l-2 2" />
		</svg>
	);
}

export function IconCode() {
	return (
		<svg {...ICON_PROPS} aria-hidden="true">
			<path d="M6 5L3 8l3 3M10 5l3 3-3 3" />
		</svg>
	);
}

export function IconBank() {
	return (
		<svg {...ICON_PROPS} aria-hidden="true">
			<path d="M2 6l6-3 6 3M3 6v6M13 6v6M6 6v6M10 6v6M2 13h12" />
		</svg>
	);
}
