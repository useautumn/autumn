import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "scraps-ui/scraps.css";
import "virtual:styles";
import { subjects } from "virtual:subject";

type Case = { name: string; node: React.ReactNode };

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
const preset = params.get("preset") ?? "classic";
const surface = params.get("surface") ?? "background";
const width = params.get("width");
const pad = Number(params.get("pad") ?? 24);
const guides = params.get("guides") === "1";
const inspect = params.get("inspect") === "1";

document.documentElement.classList.add(theme, `preset-${preset}`);
document.documentElement.style.colorScheme = theme;

const surfaceVar = `var(--${surface}, var(--background))`;

const interReady: Promise<boolean> = Promise.all([
	document.fonts.ready,
	document.fonts.load("500 13px Inter"),
])
	.then(() =>
		[...document.fonts].some(
			(face) =>
				face.family.replace(/"/g, "") === "Inter" && face.status === "loaded",
		),
	)
	.catch(() => false);

const guideOverlay = guides && (
	<div
		aria-hidden
		style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
	>
		<div
			style={{
				position: "absolute",
				left: "50%",
				top: 0,
				bottom: 0,
				width: 1,
				background: "rgba(0,140,255,0.5)",
			}}
		/>
		<div
			style={{
				position: "absolute",
				top: "50%",
				left: 0,
				right: 0,
				height: 1,
				background: "rgba(0,140,255,0.5)",
			}}
		/>
	</div>
);

function CaseBlock({ subject }: { subject: Case }) {
	return (
		<section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
			{subjects.length > 1 && (
				<div
					style={{
						fontSize: 11,
						fontFamily: "Geist Mono, ui-monospace, monospace",
						opacity: 0.55,
						color: "var(--foreground, inherit)",
					}}
				>
					{subject.name}
				</div>
			)}
			<div style={{ position: "relative", width: "fit-content" }}>
				{subject.node}
			</div>
		</section>
	);
}

type Box = { x: number; y: number; w: number; h: number; depth: number };

const boxColors = [
	"rgba(0,200,255,0.8)",
	"rgba(255,64,129,0.8)",
	"rgba(255,196,0,0.8)",
	"rgba(0,230,118,0.8)",
];

function InspectOverlay() {
	const [found, setFound] = React.useState<Box[]>([]);
	useEffect(() => {
		void interReady.then(() => {
			const stage = document.getElementById("stage");
			if (!stage) return;
			measure(stage);
		});
	}, []);
	const measure = (stage: HTMLElement) => {
		const base = stage.getBoundingClientRect();
		const results: Box[] = [];
		const walk = (el: Element, depth: number) => {
			for (const child of Array.from(el.children)) {
				if (results.length >= 800) return;
				const rect = child.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) {
					walk(child, depth);
					continue;
				}
				const style = getComputedStyle(child);
				const styled =
					style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
					style.borderTopWidth !== "0px" ||
					style.boxShadow !== "none" ||
					child.tagName === "svg";
				const hasOwnText = Array.from(child.childNodes).some(
					(node) =>
						node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
				);
				const single =
					child.children.length === 1 && child.children[0] instanceof Element
						? child.children[0].getBoundingClientRect()
						: null;
				const wrapsSingleChild =
					single !== null &&
					Math.abs(single.left - rect.left) < 1 &&
					Math.abs(single.top - rect.top) < 1 &&
					Math.abs(single.width - rect.width) < 1 &&
					Math.abs(single.height - rect.height) < 1;
				if (
					(styled || hasOwnText || child.children.length === 0) &&
					!wrapsSingleChild
				) {
					results.push({
						x: rect.left - base.left,
						y: rect.top - base.top,
						w: rect.width,
						h: rect.height,
						depth,
					});
				}
				if (child.tagName !== "svg") walk(child, depth + 1);
			}
		};
		walk(stage, 0);
		setFound(results);
	};
	const dedup = (values: number[]) => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted.filter(
			(value, i) => i === 0 || value - (sorted[i - 1] ?? 0) > 1,
		);
	};
	const xs = dedup(found.flatMap((box) => [box.x, box.x + box.w]));
	const ys = dedup(found.flatMap((box) => [box.y, box.y + box.h]));
	return (
		<div
			aria-hidden
			style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
		>
			{xs.map((x) => (
				<div
					key={`x${x}`}
					style={{
						position: "absolute",
						left: x,
						top: 0,
						bottom: 0,
						width: 1,
						background: "rgba(0,200,255,0.16)",
					}}
				/>
			))}
			{ys.map((y) => (
				<div
					key={`y${y}`}
					style={{
						position: "absolute",
						top: y,
						left: 0,
						right: 0,
						height: 1,
						background: "rgba(0,200,255,0.13)",
					}}
				/>
			))}
			{found.map((box, i) => (
				<div
					key={i}
					style={{
						position: "absolute",
						left: box.x,
						top: box.y,
						width: box.w,
						height: box.h,
						outline: `1px solid ${boxColors[box.depth % boxColors.length]}`,
						outlineOffset: -1,
					}}
				/>
			))}
		</div>
	);
}

function Stage() {
	useEffect(() => {
		void interReady.then((interLoaded) => {
			if (!interLoaded) {
				document.body.setAttribute(
					"data-render-error",
					"Inter did not load; the screenshot would show the fallback font",
				);
				return;
			}
			requestAnimationFrame(() => {
				requestAnimationFrame(() =>
					document.body.setAttribute("data-render-ready", "1"),
				);
			});
		});
	}, []);
	return (
		<div
			id="stage"
			style={{
				position: "relative",
				display: "inline-flex",
				flexDirection: "column",
				gap: 20,
				padding: pad,
				background: surfaceVar,
				width: width ? Number(width) : undefined,
				minWidth: width ? undefined : 120,
			}}
		>
			{subjects.map((subject) => (
				<CaseBlock key={subject.name} subject={subject} />
			))}
			{guideOverlay}
			{inspect && <InspectOverlay />}
		</div>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Render harness: #root missing");
createRoot(root).render(<Stage />);
