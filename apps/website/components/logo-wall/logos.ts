import { customerStoriesData } from "@/app/constant";

export type Logo = {
	id: string;
	name: string;
	src: string;
	href: string;
	aspectRatio: number;
	opticalScale?: number;
};

const REFERENCE_ASPECT_RATIO = 4.5;

export const logoHeightFactor = ({ aspectRatio, opticalScale = 1 }: Logo) =>
	Math.sqrt(REFERENCE_ASPECT_RATIO / aspectRatio) * opticalScale;

export const findCaseStudyHref = ({ id }: Logo) =>
	customerStoriesData.find((story) => story.slug === id)?.href;

export const LOGOS: Logo[] = [
	{
		id: "resend",
		name: "Resend",
		href: "https://resend.com",
		src: "/images/logos/resend.svg",
		aspectRatio: 377 / 81,
		opticalScale: 0.86,
	},
	{
		id: "mintlify",
		name: "Mintlify",
		href: "https://mintlify.com",
		src: "/images/logos/mintlify_logo.svg.svg",
		aspectRatio: 143 / 33,
		opticalScale: 1.03,
	},
	{
		id: "firecrawl",
		name: "Firecrawl",
		href: "https://firecrawl.dev",
		src: "/images/logos/Firecrawl.svg.svg",
		aspectRatio: 142 / 33,
		opticalScale: 1.1,
	},
	{
		id: "mastra",
		name: "Mastra",
		href: "https://mastra.ai",
		src: "/images/logos/mastra.svg",
		aspectRatio: 192.45 / 31.05,
		opticalScale: 1.04,
	},
	{
		id: "browser-use",
		name: "Browser Use",
		href: "https://browser-use.com",
		src: "/images/logos/Browser use.svg",
		aspectRatio: 154 / 24,
		opticalScale: 1.09,
	},
	{
		id: "t3-chat",
		name: "T3.chat",
		href: "https://t3.chat",
		src: "/images/logos/T3_svg.svg",
		aspectRatio: 113 / 24,
		opticalScale: 0.82,
	},
	{
		id: "mobbin",
		name: "Mobbin",
		href: "https://mobbin.com",
		src: "/images/logos/mobbin.svg",
		aspectRatio: 446.2 / 64,
		opticalScale: 0.84,
	},
	{
		id: "poke",
		name: "poke.com",
		href: "https://poke.com",
		src: "/images/logos/poke.com.svg",
		aspectRatio: 1118 / 214,
		opticalScale: 0.9,
	},
];
