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

export const LOGOS: Logo[] = [
	{
		id: "mintlify",
		name: "Mintlify",
		href: "https://mintlify.com",
		src: "/images/logos/mintlify_logo.svg.svg",
		aspectRatio: 143 / 33,
	},
	{
		id: "firecrawl",
		name: "Firecrawl",
		href: "https://firecrawl.dev",
		src: "/images/logos/Firecrawl.svg.svg",
		aspectRatio: 142 / 33,
		opticalScale: 1.09,
	},
	{
		id: "resend",
		name: "Resend",
		href: "https://resend.com",
		src: "/images/logos/resend.svg",
		aspectRatio: 377 / 81,
		opticalScale: 0.89,
	},
	{
		id: "mastra",
		name: "Mastra",
		href: "https://mastra.ai",
		src: "/images/logos/Mastra.svg.svg",
		aspectRatio: 192.45 / 31.05,
	},
	{
		id: "capy",
		name: "Capy",
		href: "https://capy.ai",
		src: "/images/logos/capy.svg",
		aspectRatio: 212 / 60,
		opticalScale: 0.97,
	},
	{
		id: "browser-use",
		name: "Browser Use",
		href: "https://browser-use.com",
		src: "/images/logos/Browser use.svg",
		aspectRatio: 154 / 24,
		opticalScale: 1.05,
	},
	{
		id: "t3-chat",
		name: "T3.chat",
		href: "https://t3.chat",
		src: "/images/logos/T3_svg.svg",
		aspectRatio: 113 / 24,
		opticalScale: 0.93,
	},
	{
		id: "mobbin",
		name: "Mobbin",
		href: "https://mobbin.com",
		src: "/images/logos/mobbin.svg",
		aspectRatio: 446.2 / 64,
		opticalScale: 0.87,
	},
	{
		id: "poke",
		name: "poke.com",
		href: "https://poke.com",
		src: "/images/logos/poke.com.svg",
		aspectRatio: 1118 / 214,
		opticalScale: 0.96,
	},
	{
		id: "hatchet",
		name: "Hatchet",
		href: "https://hatchet.run",
		src: "/images/logos/hatchet.svg",
		aspectRatio: 137 / 24,
		opticalScale: 0.98,
	},
	{
		id: "stackone",
		name: "StackOne",
		href: "https://www.stackone.com",
		src: "/images/logos/stackone.svg",
		aspectRatio: 120 / 16,
		opticalScale: 0.91,
	},
	{
		id: "revyl",
		name: "Revyl",
		href: "https://revyl.com",
		src: "/images/logos/revyl.svg",
		aspectRatio: 89.78 / 23.39,
		opticalScale: 0.97,
	},
	{
		id: "revisiondojo",
		name: "RevisionDojo",
		href: "https://www.revisiondojo.com",
		src: "/images/logos/revisiondojo.svg",
		aspectRatio: 415 / 64,
		opticalScale: 1.09,
	},
	{
		id: "runable",
		name: "Runable",
		href: "https://runable.com",
		src: "/images/logos/runable.svg",
		aspectRatio: 106.6 / 21.7,
		opticalScale: 1.05,
	},
];
