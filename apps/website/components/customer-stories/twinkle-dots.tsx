import type { CSSProperties } from "react";

const CELL = 14;
// Two offset dot grids so the cross-fade reads as dots shifting, not a flat pulse.
const DOT = "radial-gradient(rgba(0,0,0,0.5) 1.1px, transparent 1.1px)";
const FADE = "radial-gradient(150% 150% at 0% 0%, #000 0%, transparent 92%)";

const baseLayer: CSSProperties = {
	backgroundImage: DOT,
	backgroundSize: `${CELL}px ${CELL}px`,
	WebkitMaskImage: FADE,
	maskImage: FADE,
};

export function TwinkleDots() {
	return (
		<div
			aria-hidden="true"
			className="cs-twinkle pointer-events-none absolute inset-0 z-0"
		>
			<div className="cs-twinkle-a absolute inset-0" style={baseLayer} />
			<div
				className="cs-twinkle-b absolute inset-0"
				style={{
					...baseLayer,
					backgroundPosition: `${CELL / 2}px ${CELL / 2}px`,
				}}
			/>

			<style jsx>{`
				.cs-twinkle-a,
				.cs-twinkle-b {
					animation: cs-twinkle 6s ease-in-out infinite alternate;
				}
				.cs-twinkle-b {
					animation-delay: -3s;
				}
				@keyframes cs-twinkle {
					from {
						opacity: 0.05;
					}
					to {
						opacity: 0.18;
					}
				}
				@media (prefers-reduced-motion: reduce) {
					.cs-twinkle-a,
					.cs-twinkle-b {
						animation: none;
						opacity: 0.1;
					}
				}
			`}</style>
		</div>
	);
}
