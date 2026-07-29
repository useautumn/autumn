import Link from "next/link";
import type { CSSProperties } from "react";
import { type CustomerStory, IconArrowRightSmall } from "@/app/constant";
import { TwinkleDots } from "./twinkle-dots";

const PANEL_VARS = {
	"--fg": "#FFFFFF",
	"--fg-muted": "rgba(255,255,255,0.72)",
	"--rule": "rgba(255,255,255,0.18)",
} as CSSProperties;

const MASK_BASE: CSSProperties = {
	WebkitMaskRepeat: "no-repeat",
	maskRepeat: "no-repeat",
	WebkitMaskPosition: "center",
	maskPosition: "center",
	WebkitMaskSize: "contain",
	maskSize: "contain",
};

function Founder({ story }: { story: CustomerStory }) {
	const content = (
		<>
			<img
				src={story.founderImage}
				alt={story.author.name}
				className="h-14 w-14 shrink-0 object-contain object-bottom select-none"
			/>
			<span className="leading-[17px]">
				<span className="block font-sans text-[14px] font-medium tracking-[-2%]">
					{story.author.name}
				</span>
				<span className="block font-sans text-[13px] tracking-[-2%] text-[color:var(--fg-muted)]">
					{story.author.title}
				</span>
			</span>
		</>
	);

	if (!story.href) {
		return <div className="flex items-center gap-3.5">{content}</div>;
	}

	return (
		<Link href={story.href} className="group flex items-center gap-3.5">
			{content}
		</Link>
	);
}

export function StoryPanel({ story }: { story: CustomerStory }) {
	const href = story.href;

	return (
		<div
			className="relative z-10 flex h-full flex-col text-[color:var(--fg)]"
			style={{ ...PANEL_VARS, "--surface": story.surface } as CSSProperties}
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -inset-6 md:-inset-10 xl:-inset-12 -z-10 overflow-hidden"
			>
				<div
					className="absolute inset-0"
					style={{ backgroundColor: "var(--surface)" }}
				/>
				<div className="absolute inset-0 bg-black/30" />
				<TwinkleDots />
				<div
					className="absolute -right-[6%] top-1/2 -translate-y-1/2 aspect-square opacity-[0.09]"
					style={{
						...MASK_BASE,
						height: story.glyphHeight ?? "150%",
						WebkitMaskImage: `url(${story.iconLogo})`,
						maskImage: `url(${story.iconLogo})`,
						backgroundColor: "var(--fg)",
					}}
				/>
			</div>

			<p className="font-sans text-[22px] leading-[29px] md:text-[30px] md:leading-[38px] tracking-[-3%] font-normal max-w-[26ch] md:max-w-[34ch]">
				&ldquo;{story.quote}&rdquo;
			</p>

			{href && (
				<Link
					href={href}
					className="group mt-7 inline-flex w-fit items-center gap-2 bg-[color:var(--fg)] px-3.5 py-2 font-mono text-[12px] font-medium tracking-[-2%] uppercase text-[#0A0A0A] hover:opacity-90 transition-opacity duration-300"
				>
					View full story
					<IconArrowRightSmall className="text-current" />
				</Link>
			)}

			<div className="mt-auto pt-10 flex items-end gap-6">
				<Founder story={story} />
			</div>
		</div>
	);
}
