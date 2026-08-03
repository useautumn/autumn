import type { CustomerStory } from "@/app/constant";

type StorySpineProps = {
	story: CustomerStory;
	onClick: () => void;
};

export function StorySpine({ story, onClick }: StorySpineProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={`View ${story.name} story`}
			className="group relative h-full w-full overflow-hidden cursor-pointer"
		>
			<div
				className="absolute inset-0"
				style={{ backgroundColor: story.surface }}
			/>
			<div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors duration-300" />
			<span
				className="absolute left-10 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 opacity-90"
				style={{
					WebkitMaskImage: `url(${story.iconLogo})`,
					maskImage: `url(${story.iconLogo})`,
					WebkitMaskRepeat: "no-repeat",
					maskRepeat: "no-repeat",
					WebkitMaskPosition: "center",
					maskPosition: "center",
					WebkitMaskSize: "contain",
					maskSize: "contain",
					backgroundColor: "#FFFFFF",
				}}
			/>
		</button>
	);
}
