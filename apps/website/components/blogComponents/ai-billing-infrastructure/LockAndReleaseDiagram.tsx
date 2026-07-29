"use client";

import { useLayoutEffect, useRef, useState } from "react";

const DIAGRAM_W = 840;
const DIAGRAM_H = 310;

const KEYFRAMES = `
@keyframes lrdDotApprove {
  0% { left: 60px; top: 88px; opacity: 0; }
  5% { left: 60px; top: 88px; opacity: 1; }
  62%, 100% { left: 640px; top: 88px; opacity: 1; }
}
@keyframes lrdDotReject1 {
  0% { left: 60px; top: 88px; opacity: 0; }
  9% { left: 60px; top: 88px; opacity: 1; }
  40% { left: 314px; top: 88px; opacity: 1; }
  56% { left: 314px; top: 188px; opacity: 1; }
  61%, 100% { left: 314px; top: 188px; opacity: 0; }
}
@keyframes lrdDotReject2 {
  0% { left: 60px; top: 88px; opacity: 0; }
  13% { left: 60px; top: 88px; opacity: 1; }
  44% { left: 314px; top: 88px; opacity: 1; }
  60% { left: 314px; top: 188px; opacity: 1; }
  65%, 100% { left: 314px; top: 188px; opacity: 0; }
}
@keyframes lrdDotReject3 {
  0% { left: 60px; top: 88px; opacity: 0; }
  17% { left: 60px; top: 88px; opacity: 1; }
  48% { left: 314px; top: 88px; opacity: 1; }
  64% { left: 314px; top: 188px; opacity: 1; }
  69%, 100% { left: 314px; top: 188px; opacity: 0; }
}
@keyframes lrdDotBatch {
  0%, 55% { left: 398px; top: 108px; opacity: 0; }
  60% { left: 398px; top: 108px; opacity: 1; }
  90%, 100% { left: 640px; top: 225px; opacity: 1; }
}
@keyframes lrdGatePulse {
  0%, 34% { box-shadow: 0 0 0 0 rgba(180,149,255,0); }
  42% { box-shadow: 0 0 0 10px rgba(180,149,255,0.16); }
  52%, 100% { box-shadow: 0 0 0 0 rgba(180,149,255,0); }
}
@keyframes lrdChPulse {
  0%, 56% { box-shadow: 0 0 0 0 rgba(242,193,78,0); }
  64% { box-shadow: 0 0 0 8px rgba(242,193,78,0.14); }
  74%, 100% { box-shadow: 0 0 0 0 rgba(242,193,78,0); }
}
@keyframes lrdPgPulse {
  0%, 86% { box-shadow: 0 0 0 0 rgba(107,159,255,0); }
  92% { box-shadow: 0 0 0 8px rgba(107,159,255,0.14); }
  99%, 100% { box-shadow: 0 0 0 0 rgba(107,159,255,0); }
}
@keyframes lrdBalBefore { 0%, 44% { opacity: 1; } 52%, 100% { opacity: 0; } }
@keyframes lrdBalAfter { 0%, 44% { opacity: 0; } 52%, 100% { opacity: 1; } }
@keyframes lrdDashFlow { to { stroke-dashoffset: -20; } }
@media (prefers-reduced-motion: reduce) {
  .lrd-diagram *, .lrd-diagram { animation: none !important; }
}
`;

const MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

export function LockAndReleaseDiagram() {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useLayoutEffect(() => {
		const el = wrapRef.current;
		if (!el) {
			return;
		}
		const update = () => {
			const width = el.clientWidth;
			if (width > 0) {
				setScale(Math.min(1, width / DIAGRAM_W));
			}
		};
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={wrapRef}
			style={{
				margin: "2rem 0",
				width: "100%",
				height: DIAGRAM_H * scale,
				overflow: "hidden",
			}}
		>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static keyframes, no user input */}
			<style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
			<div
				className="lrd-diagram"
				style={{
					position: "relative",
					width: DIAGRAM_W,
					height: DIAGRAM_H,
					transform: `scale(${scale})`,
					transformOrigin: "top left",
					background: "#111114",
					border: "1px solid #26262c",
					borderRadius: 12,
					fontFamily: MONO,
					overflow: "hidden",
				}}
			>
				<svg
					width="840"
					height="310"
					style={{ position: "absolute", inset: 0 }}
					fill="none"
					aria-hidden="true"
				>
					<path d="M60 88 L230 88" stroke="#26262c" strokeWidth={1.5} />
					<path d="M398 88 L588 88" stroke="#3a331f" strokeWidth={1.5} />
					<path d="M314 136 L314 196" stroke="#3a2a2a" strokeWidth={1.5} />
					<path
						d="M398 108 L588 225"
						stroke="#22303f"
						strokeWidth={1.5}
						strokeDasharray="5 5"
						style={{ animation: "lrdDashFlow 1s linear infinite" }}
					/>
				</svg>

				<div
					style={{
						position: "absolute",
						left: 438,
						top: 66,
						fontSize: 11,
						color: "#7c7c85",
					}}
				>
					enqueue ledger
				</div>
				<div
					style={{
						position: "absolute",
						left: 418,
						top: 186,
						fontSize: 11,
						color: "#7c7c85",
					}}
				>
					batch job · async
				</div>

				<div
					style={{
						position: "absolute",
						left: 20,
						top: 70,
						fontSize: 11,
						letterSpacing: "0.08em",
						color: "#7c7c85",
						textTransform: "uppercase",
						width: 70,
					}}
				>
					4 reqs
					<br />
					×500
				</div>

				{/* Redis node */}
				<div
					style={{
						position: "absolute",
						left: 230,
						top: 40,
						width: 168,
						minHeight: 96,
						borderRadius: 10,
						background: "#17171c",
						border: "1.5px solid #3a3550",
						padding: 12,
						boxSizing: "border-box",
						zIndex: 3,
						animation: "lrdGatePulse 6.5s ease-in-out infinite",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<div
							style={{
								width: 6,
								height: 6,
								borderRadius: "50%",
								background: "#b495ff",
							}}
						/>
						<div style={{ fontSize: 13, color: "#E6E6E9" }}>Redis</div>
						<div style={{ fontSize: 10, color: "#7c7c85" }}>atomic counter</div>
					</div>
					<div style={{ position: "relative", height: 26, marginTop: 6 }}>
						<div
							style={{
								position: "absolute",
								fontSize: 22,
								color: "#E6E6E9",
								animation: "lrdBalBefore 6.5s linear infinite",
							}}
						>
							600
						</div>
						<div
							style={{
								position: "absolute",
								fontSize: 22,
								color: "#6ee7a8",
								animation: "lrdBalAfter 6.5s linear infinite",
							}}
						>
							100
						</div>
					</div>
					<div style={{ fontSize: 10, color: "#b495ff", marginTop: 4 }}>
						Lua: decrement + enqueue
					</div>
				</div>

				{/* ClickHouse node */}
				<div
					style={{
						position: "absolute",
						left: 588,
						top: 43,
						width: 210,
						minHeight: 90,
						borderRadius: 10,
						background: "#17171c",
						border: "1.5px solid #3a3524",
						padding: 12,
						boxSizing: "border-box",
						zIndex: 3,
						animation: "lrdChPulse 6.5s ease-in-out infinite",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<div
							style={{
								width: 6,
								height: 6,
								borderRadius: "50%",
								background: "#f2c14e",
							}}
						/>
						<div style={{ fontSize: 13, color: "#E6E6E9" }}>ClickHouse</div>
						<div style={{ fontSize: 10, color: "#7c7c85" }}>ledger</div>
					</div>
					<div style={{ fontSize: 12, color: "#E6E6E9", marginTop: 8 }}>
						append-only insert
					</div>
					<div style={{ fontSize: 10, color: "#f2c14e", marginTop: 4 }}>
						atomic with deduct
					</div>
				</div>

				{/* Postgres node */}
				<div
					style={{
						position: "absolute",
						left: 588,
						top: 180,
						width: 210,
						minHeight: 90,
						borderRadius: 10,
						background: "#17171c",
						border: "1.5px solid #24303a",
						padding: 12,
						boxSizing: "border-box",
						zIndex: 3,
						animation: "lrdPgPulse 6.5s ease-in-out infinite",
					}}
				>
					<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
						<div
							style={{
								width: 6,
								height: 6,
								borderRadius: "50%",
								background: "#6b9fff",
							}}
						/>
						<div style={{ fontSize: 13, color: "#E6E6E9" }}>Postgres</div>
						<div style={{ fontSize: 10, color: "#7c7c85" }}>batch sync</div>
					</div>
					<div style={{ fontSize: 12, color: "#E6E6E9", marginTop: 8 }}>
						source of truth
					</div>
					<div style={{ fontSize: 10, color: "#6b9fff", marginTop: 4 }}>
						eventually consistent
					</div>
				</div>

				{/* rejected chip */}
				<div
					style={{
						position: "absolute",
						left: 230,
						top: 196,
						width: 168,
						border: "1px solid #3a2a2a",
						background: "#1c1416",
						borderRadius: 8,
						padding: "8px 12px",
						boxSizing: "border-box",
						zIndex: 3,
					}}
				>
					<div style={{ fontSize: 12, color: "#ff8f8f" }}>✗ rejected ×3</div>
					<div style={{ fontSize: 10, color: "#7c7c85", marginTop: 2 }}>
						insufficient balance
					</div>
				</div>

				{/* moving dots */}
				<div
					style={{
						position: "absolute",
						width: 12,
						height: 12,
						margin: -6,
						borderRadius: "50%",
						background: "#6ee7a8",
						boxShadow: "0 0 12px rgba(110,231,168,0.7)",
						zIndex: 1,
						animation: "lrdDotApprove 6.5s linear infinite",
					}}
				/>
				<div
					style={{
						position: "absolute",
						width: 12,
						height: 12,
						margin: -6,
						borderRadius: "50%",
						background: "#ff8f8f",
						boxShadow: "0 0 10px rgba(255,143,143,0.5)",
						zIndex: 1,
						animation: "lrdDotReject1 6.5s linear infinite",
					}}
				/>
				<div
					style={{
						position: "absolute",
						width: 12,
						height: 12,
						margin: -6,
						borderRadius: "50%",
						background: "#ff8f8f",
						boxShadow: "0 0 10px rgba(255,143,143,0.5)",
						zIndex: 1,
						animation: "lrdDotReject2 6.5s linear infinite",
					}}
				/>
				<div
					style={{
						position: "absolute",
						width: 12,
						height: 12,
						margin: -6,
						borderRadius: "50%",
						background: "#ff8f8f",
						boxShadow: "0 0 10px rgba(255,143,143,0.5)",
						zIndex: 1,
						animation: "lrdDotReject3 6.5s linear infinite",
					}}
				/>
				<div
					style={{
						position: "absolute",
						width: 10,
						height: 10,
						margin: -5,
						borderRadius: "50%",
						background: "#6b9fff",
						boxShadow: "0 0 10px rgba(107,159,255,0.6)",
						zIndex: 1,
						animation: "lrdDotBatch 6.5s linear infinite",
					}}
				/>
			</div>
		</div>
	);
}
