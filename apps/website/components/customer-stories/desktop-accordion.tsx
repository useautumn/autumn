import type { CSSProperties } from "react";
import { featuredCustomerStories } from "@/app/constant";
import { BracketCorners } from "./bracket-corners";
import { PixelDissolve } from "./pixel-dissolve";
import { StoryPanel } from "./story-panel";
import { StorySpine, StorySpineIcon } from "./story-spine";
import {
	EXPAND_MS,
	SPINE_WIDTH,
	TRACK_GAP,
	useAccordion,
} from "./use-accordion";

const CARD_HEIGHT = 420;
const SECTION_SURFACE = "#0F0F0F";

function blendWithBlack(hex: string, blackOpacity: number) {
	const match = /^#([0-9a-f]{6})$/i.exec(hex);
	if (!match) return hex;

	const keep = 1 - blackOpacity;
	const value = Number.parseInt(match[1], 16);
	const channel = (shift: number) =>
		Math.round(((value >> shift) & 0xff) * keep)
			.toString(16)
			.padStart(2, "0");

	return `#${channel(16)}${channel(8)}${channel(0)}`;
}

export function DesktopAccordion() {
	const {
		trackRef,
		setActiveIndex,
		revealKey,
		dissolveDir,
		isTransitioning,
		contentWidth,
		cardLayout,
	} = useAccordion(featuredCustomerStories.length);

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
				{featuredCustomerStories.map((story, index) => {
					const { state } = cardLayout(index);
					const isActive = state === "active";
					const isDeparting = state === "departing";
					const compactSurface = blendWithBlack(story.surface, 0.3);
					return (
						<div
							key={story.slug}
							data-state={state}
							className="cs-card relative h-full overflow-hidden"
						>
							<div
								className="cs-content absolute inset-y-0 left-0 z-10 p-6 md:p-10 xl:p-12 flex flex-col bg-[#0A0A0A]"
								style={{ pointerEvents: isActive ? "auto" : "none" }}
							>
								<StoryPanel story={story} />
								{isDeparting && isTransitioning && (
									<PixelDissolve
										width={contentWidth}
										height={CARD_HEIGHT}
										revealKey={revealKey}
										fromColor={SECTION_SURFACE}
										retainedColor={compactSurface}
										retainedWidth={SPINE_WIDTH}
										mode="cover"
										direction={dissolveDir}
										seed={revealKey}
									/>
								)}
							</div>
							<div className="cs-spine absolute inset-0 z-0">
								<StorySpine
									story={story}
									onClick={() => setActiveIndex(index)}
									disabled={isActive || isTransitioning}
								/>
							</div>
							<div className="cs-compact-icon pointer-events-none absolute inset-0 z-40">
								<StorySpineIcon story={story} />
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
					flex: 0 0 ${SPINE_WIDTH}px;
					min-width: 0;
					opacity: 1;
					transition:
						flex-grow ${EXPAND_MS}ms cubic-bezier(0.77, 0, 0.175, 1),
						flex-basis ${EXPAND_MS}ms cubic-bezier(0.77, 0, 0.175, 1);
					will-change: flex-grow, flex-basis;
				}
				.cs-card[data-state="active"] {
					flex-grow: 1;
					flex-basis: 0px;
				}
				.cs-card[data-state="neighbor"] {
					flex-grow: 0;
					flex-basis: ${SPINE_WIDTH}px;
				}
				.cs-card[data-state="departing"] {
					flex-grow: 0;
					flex-basis: ${SPINE_WIDTH}px;
				}
				.cs-content {
					width: var(--cs-content-w);
					visibility: hidden;
					opacity: 0;
					transition: opacity 140ms cubic-bezier(0.23, 1, 0.32, 1);
				}
				.cs-card[data-state="active"] .cs-content {
					visibility: visible;
					opacity: 1;
					transition-delay: 80ms;
				}
				.cs-card[data-state="departing"] .cs-content {
					visibility: visible;
					opacity: 1;
					transition: none;
				}
				.cs-spine {
					visibility: visible;
				}
				.cs-card[data-state="active"] .cs-spine {
					pointer-events: none;
				}
				.cs-card[data-state="departing"] .cs-spine {
					pointer-events: none;
				}
				.cs-compact-icon {
					opacity: 0;
					transition: opacity 220ms cubic-bezier(0.23, 1, 0.32, 1);
				}
				.cs-card[data-state="departing"] .cs-compact-icon {
					opacity: 1;
				}
				@media (prefers-reduced-motion: reduce) {
					.cs-card,
					.cs-content,
					.cs-compact-icon {
						transition: none;
					}
				}
			`}</style>
		</div>
	);
}
