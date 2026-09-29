import Image from "next/image";

const STATS = [
	{ value: "1.7M+", label: "Registered users" },
	{ value: "15", label: "People on the team (Aug 2026)" },
	{ value: "$21M", label: "Series A, co-led by SVC and Nexus" },
	{ value: "10x", label: "Growth in billing usage on Autumn", accent: true },
] as const;

const FOUNDERS = [
	{ name: "Umesh Kumar", image: "/images/blog/runable/umesh.jpg" },
	{ name: "Saksham Sarda", image: "/images/blog/runable/saksham.jpg" },
] as const;

const CORNERS = [
	"top-0 left-0 border-t-[1.5px] border-l-[1.5px]",
	"top-0 right-0 border-t-[1.5px] border-r-[1.5px]",
	"bottom-0 left-0 border-b-[1.5px] border-l-[1.5px]",
	"bottom-0 right-0 border-b-[1.5px] border-r-[1.5px]",
] as const;

const ICON_MASK = "url(/images/blog/runable/runable-icon-dark.svg)";

function StoryPanel() {
	return (
		<div className="relative flex min-h-[420px] flex-col justify-between gap-16 overflow-hidden bg-[linear-gradient(135deg,#B1E5FF_0%,#D5F1FF_100%)] p-8 text-[#161616] md:min-h-[560px] md:p-16">
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -right-[8%] top-1/2 aspect-square h-[130%] -translate-y-1/2 bg-[#161616] opacity-[0.07]"
				style={{
					WebkitMaskImage: ICON_MASK,
					maskImage: ICON_MASK,
					WebkitMaskSize: "contain",
					maskSize: "contain",
					WebkitMaskRepeat: "no-repeat",
					maskRepeat: "no-repeat",
				}}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-4 md:inset-6"
			>
				{CORNERS.map((corner) => (
					<span
						key={corner}
						className={`absolute h-4 w-4 border-[#161616]/60 ${corner}`}
					/>
				))}
			</div>

			<div className="relative flex items-center justify-between gap-4">
				<img
					src="/images/blog/runable/runable-wordmark-dark.svg"
					alt="Runable"
					className="h-7 w-auto md:h-8"
				/>
				<span className="font-mono text-[12px] uppercase tracking-[-2%] text-[#161616B3] md:text-[14px]">
					{"// Customer story"}
				</span>
			</div>

			<div className="relative flex flex-col gap-6 md:gap-8">
				<h1 className="font-sans text-[36px] font-normal leading-[1.05] tracking-[-4%] md:text-[64px]">
					How Runable prices an AI agent{" "}
					<span className="text-[#161616A6] md:block">
						for 1.7 million users
					</span>
				</h1>
				<p className="max-w-[620px] font-sans text-[15px] font-light leading-6 tracking-[-2%] text-[#161616B3] md:text-[18px] md:leading-7">
					Three pricing versions in a year, daily credits, regional free tiers
					and web + iOS billing, run by a 15-person team.
				</p>
			</div>
		</div>
	);
}

function AtAGlance() {
	return (
		<div className="border-[#292929] border-y border-l bg-black">
			<div className="grid grid-cols-2 md:grid-cols-4">
				{STATS.map((stat) => (
					<div
						key={stat.label}
						className="flex flex-col gap-2 border-[#292929] border-r border-b px-6 py-6 [&:nth-child(n+3)]:border-b-0 md:border-b-0 md:py-8"
					>
						<span
							className={`font-sans text-[32px] leading-none tracking-[-4%] md:text-[44px] ${
								"accent" in stat ? "text-[#9564ff]" : "text-white"
							}`}
						>
							{stat.value}
						</span>
						<span className="font-sans text-[13px] font-light tracking-[-2%] text-[#FFFFFF99] md:text-[15px]">
							{stat.label}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function TeamPhoto() {
	return (
		<div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
			<Image
				src="/images/blog/runable/team.jpg"
				alt="The Runable team"
				width={2160}
				height={1060}
				sizes="(min-width: 768px) 720px, 100vw"
				className="h-auto w-full border border-[#292929]"
			/>
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div className="flex flex-wrap items-center gap-6">
					{FOUNDERS.map((founder) => (
						<div key={founder.name} className="flex items-center gap-3">
							<img
								src={founder.image}
								alt={founder.name}
								className="h-10 w-10 shrink-0 object-cover"
							/>
							<span className="leading-[17px]">
								<span className="block font-sans text-[14px] font-medium tracking-[-2%] text-white">
									{founder.name}
								</span>
								<span className="block font-sans text-[13px] tracking-[-2%] text-[#FFFFFF99]">
									Co-founder
								</span>
							</span>
						</div>
					))}
				</div>
				<span className="font-mono text-[12px] uppercase text-[#FFFFFF66]">
					The Runable team, 2026
				</span>
			</div>
		</div>
	);
}

export function RunableHero() {
	return (
		<div className="not-prose flex flex-col gap-6">
			<StoryPanel />
			<AtAGlance />
			<TeamPhoto />
		</div>
	);
}
