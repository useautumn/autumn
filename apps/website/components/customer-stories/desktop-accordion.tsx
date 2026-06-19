import type { CSSProperties } from "react";
import { customerStoriesData } from "@/app/constant";
import { BracketCorners } from "./bracket-corners";
import { PixelDissolve } from "./pixel-dissolve";
import { StoryPanel } from "./story-panel";
import { StorySpine } from "./story-spine";
import { SPINE_WIDTH, TRACK_GAP, useAccordion } from "./use-accordion";

const CARD_HEIGHT = 420;
const DARK_SURFACE = "#0A0A0A";

// Colour the pixels dissolve away from. DARK_SURFACE reads as the slide fading
// up from black; the prev slide's surface gives a colour-to-colour crossfade.
const DISSOLVE_FROM = "dark" as "dark" | "crossfade";

export function DesktopAccordion() {
	const {
		trackRef,
		prevActiveIndex,
		setActiveIndex,
		revealKey,
		dissolveDir,
		contentWidth,
		cardLayout,
	} = useAccordion(customerStoriesData.length);

	const fromColor =
		DISSOLVE_FROM === "dark"
			? DARK_SURFACE
			: customerStoriesData[prevActiveIndex].surface;

	// Track laid out left→right by flex order: left spine, content, right spine.
	// trackX gives each surface its slot offset so the directional gradient is
	// one continuous sweep across all three rather than restarting per card.
	const trackWidth = contentWidth + 2 * (SPINE_WIDTH + TRACK_GAP);
	const contentTrackX = SPINE_WIDTH + TRACK_GAP;
	const rightSpineTrackX = contentTrackX + contentWidth + TRACK_GAP;
	const spineTrackX = (order: number) => (order < 0 ? 0 : rightSpineTrackX);

	return (
		<div className="mt-8 mb-12 xl:mb-16 px-4 xl:px-22.75 hidden lg:block">
			<div
				ref={trackRef}
				className="cs-track flex"
				style={
					{
						height: CARD_HEIGHT,
						"--cs-content-w": contentWidth ? `${contentWidth}px` : "100%",
					} as CSSProperties
				}
			>
				{customerStoriesData.map((story, index) => {
					const { state, order } = cardLayout(index);
					const isActive = state === "active";
					return (
						<div
							key={story.slug}
							data-state={state}
							style={{ order }}
							className="cs-card relative h-full overflow-hidden"
						>
							<div
								className="cs-content absolute inset-y-0 left-0 p-6 md:p-10 xl:p-12 flex flex-col bg-[#0A0A0A]"
								style={{ pointerEvents: isActive ? "auto" : "none" }}
							>
								<StoryPanel story={story} />
								{isActive && (
									<PixelDissolve
										width={contentWidth}
										height={CARD_HEIGHT}
										revealKey={revealKey}
										fromColor={fromColor}
										direction={dissolveDir}
										seed={revealKey}
										trackX={contentTrackX}
										trackWidth={trackWidth}
									/>
								)}
							</div>
							<div className="cs-spine absolute inset-0">
								<StorySpine
									story={story}
									onClick={() => setActiveIndex(index)}
								/>
								{state === "neighbor" && (
									<PixelDissolve
										width={SPINE_WIDTH}
										height={CARD_HEIGHT}
										revealKey={revealKey}
										fromColor={fromColor}
										direction={dissolveDir}
										seed={revealKey * 31 + index}
										trackX={spineTrackX(order)}
										trackWidth={trackWidth}
									/>
								)}
							</div>
							{isActive && <BracketCorners />}
						</div>
					);
				})}
			</div>

			<style jsx>{`
				.cs-track {
					gap: ${TRACK_GAP}px;
				}
				.cs-card {
					flex: 0 0 0px;
					min-width: 0;
					opacity: 0;
				}
				.cs-card[data-state="active"] {
					flex: 1 1 0px;
					opacity: 1;
				}
				.cs-card[data-state="neighbor"] {
					flex: 0 0 ${SPINE_WIDTH}px;
					opacity: 1;
				}
				.cs-card[data-state="hidden"] {
					flex: 0 0 0px;
					margin-left: -${TRACK_GAP}px;
					opacity: 0;
				}
				.cs-content {
					width: var(--cs-content-w);
					visibility: hidden;
				}
				.cs-card[data-state="active"] .cs-content {
					visibility: visible;
				}
				.cs-spine {
					opacity: 1;
				}
				.cs-card[data-state="active"] .cs-spine {
					opacity: 0;
					pointer-events: none;
				}
			`}</style>
		</div>
	);
}
