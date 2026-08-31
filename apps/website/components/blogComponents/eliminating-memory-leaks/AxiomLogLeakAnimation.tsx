"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const LOOP_SECONDS = 13;
const PACKET_COUNT = 12;
const BOX_COUNT = 13;
const REVEAL_PX = 275.5;

const KEYFRAMES = `
@keyframes axStream { from { background-position-x: 0px; } to { background-position-x: 18px; } }
@keyframes axGlow {
  0%   { border-color: #2e2b3d; color: #8b8598; box-shadow: 0 0 0 0 rgba(149,100,255,0); }
  10%  { border-color: #8163d8; color: #e2cdff; box-shadow: 0 0 22px -2px rgba(149,100,255,0.55); }
  55%  { border-color: #453c68; color: #b49ede; box-shadow: 0 0 8px -4px rgba(149,100,255,0.2); }
  100% { border-color: #2e2b3d; color: #8b8598; box-shadow: 0 0 0 0 rgba(149,100,255,0); }
}
@keyframes axFly {
  0% { left: 0%; opacity: 0; }
  1% { opacity: 1; }
  7.69% { left: 100%; opacity: 1; }
  7.7% { left: 100%; opacity: 0; }
  100% { left: 100%; opacity: 0; }
}
@keyframes axReveal { from { width: 0px; } to { width: ${REVEAL_PX}px; } }
@media (prefers-reduced-motion: reduce) { .axleak * { animation: none !important; } }
`;

const chip: CSSProperties = {
	flex: "none",
	padding: "11px 15px",
	border: "1px solid #2c2c2c",
	borderRadius: 9,
	background: "#141414",
	fontFamily: "'Geist Mono', ui-monospace, monospace",
	fontSize: 12,
	color: "#d7d7db",
};

export function AxiomLogLeakAnimation() {
	const rootRef = useRef<HTMLDivElement>(null);
	const [playing, setPlaying] = useState(true);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;

		const observer = new IntersectionObserver(
			([entry]) => setPlaying(entry.isIntersecting),
			{ threshold: 0.2 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const playState = playing ? "running" : "paused";

	return (
		<div
			ref={rootRef}
			aria-label="Logs leaving the app over HTTP and accumulating native memory"
			className="axleak not-prose my-8"
			style={{
				["--at" as string]: `${LOOP_SECONDS}s`,
				["--ap" as string]: playState,
				["--ab" as string]: `calc(var(--at) / ${BOX_COUNT})`,
				width: "100%",
				border: "1px solid #292929",
				borderRadius: 14,
				background: "#0F0F0F",
				boxSizing: "border-box",
				padding: "36px 32px 38px",
			}}
		>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static keyframes, no user input */}
			<style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

			<div style={{ display: "flex", alignItems: "center", gap: 14 }}>
				<div style={chip}>app</div>

				<div
					style={{
						flex: 1,
						height: 6,
						animation: "axStream 1.1s linear infinite",
						animationPlayState: playState,
						backgroundImage:
							"radial-gradient(circle at 3px 3px, #38383f 1.6px, transparent 2.1px)",
						backgroundSize: "9px 6px",
					}}
				/>

				<div
					style={{
						flex: "none",
						animation: "axGlow var(--ab) linear infinite",
						animationPlayState: playState,
						padding: "11px 15px",
						border: "1px solid #2e2b3d",
						borderRadius: 9,
						background: "rgba(149,100,255,0.06)",
						fontFamily: "'Geist Mono', ui-monospace, monospace",
						fontSize: 12,
						color: "#8b8598",
					}}
				>
					fetch POST
				</div>

				<div style={{ position: "relative", flex: 1, height: 10 }}>
					<div
						style={{
							position: "absolute",
							left: 0,
							right: 0,
							top: "50%",
							height: 1,
							background: "#222226",
						}}
					/>
					{Array.from({ length: PACKET_COUNT }, (_, i) => (
						<div
							key={i}
							style={{
								animation: "axFly var(--at) linear infinite",
								animationPlayState: playState,
								animationDelay: `calc(var(--ab) * ${i})`,
								position: "absolute",
								top: 2,
								width: 6,
								height: 6,
								borderRadius: 1,
								background: "#9564ff",
								opacity: 0,
							}}
						/>
					))}
				</div>

				<div style={chip}>Axiom</div>
			</div>

			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 14,
					marginTop: 38,
				}}
			>
				<div
					style={{
						flex: "none",
						fontFamily: "'Geist Mono', ui-monospace, monospace",
						fontSize: 11,
						color: "#6d6878",
					}}
				>
					memory
				</div>
				<div style={{ position: "relative", flex: 1, height: 26 }}>
					<div
						style={{
							animation: "axReveal var(--at) steps(13, end) infinite",
							animationPlayState: playState,
							position: "absolute",
							left: 0,
							top: 0,
							bottom: 0,
							width: 0,
							overflow: "hidden",
						}}
					>
						<div
							style={{
								display: "flex",
								gap: 5,
								height: "100%",
								marginLeft: 2.5,
							}}
						>
							{Array.from({ length: BOX_COUNT }, (_, i) => (
								<div
									key={i}
									style={{
										flex: "none",
										width: 16,
										height: "100%",
										borderRadius: 2,
										background: "#9564ff",
									}}
								/>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
