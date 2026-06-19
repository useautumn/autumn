import { motion } from "motion/react";
import { customerStoriesData } from "@/app/constant";
import { BracketCorners } from "./bracket-corners";
import { StoryPanel } from "./story-panel";
import { useMobileCarousel } from "./use-mobile-carousel";

export function MobileCarousel() {
	const { containerRef, x, activeIndex, goTo, onDragEnd } = useMobileCarousel(
		customerStoriesData.length,
	);

	return (
		<div className="lg:hidden mt-8 mb-12 overflow-hidden">
			<motion.div
				ref={containerRef}
				className="flex gap-3 px-4 cursor-grab active:cursor-grabbing"
				style={{ x }}
				drag="x"
				dragElastic={0.18}
				onDragEnd={onDragEnd}
			>
				{customerStoriesData.map((story) => (
					<div
						key={story.slug}
						className="relative shrink-0 w-[86vw] h-[440px] overflow-hidden"
					>
						<div className="absolute inset-0 p-6 flex flex-col">
							<StoryPanel story={story} />
						</div>
						<BracketCorners />
					</div>
				))}
			</motion.div>

			<div className="flex justify-center gap-2 mt-5">
				{customerStoriesData.map((story, index) => (
					<button
						key={story.slug}
						type="button"
						aria-label={`Go to ${story.name}`}
						onClick={() => goTo(index)}
						className="h-1.5 rounded-full transition-all duration-300"
						style={{
							width: index === activeIndex ? 20 : 6,
							backgroundColor: index === activeIndex ? story.accent : "#3A3A3A",
						}}
					/>
				))}
			</div>
		</div>
	);
}
