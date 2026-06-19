import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { customerStoriesData } from "@/app/constant";
import type { BlogParams } from "@/lib/types";

export function generateStaticParams() {
	return customerStoriesData.map((story) => ({ slug: story.slug }));
}

export async function generateMetadata({
	params,
}: {
	params: BlogParams;
}): Promise<Metadata> {
	const { slug } = await params;
	const story = customerStoriesData.find((item) => item.slug === slug);
	if (!story) return { title: "Customer Story Not Found" };

	const title = `${story.name} customer story`;
	const description = `${story.headline.lead} ${story.headline.emphasis}`;
	return {
		title,
		description,
		openGraph: { title, description, type: "article", siteName: "Autumn" },
		twitter: { card: "summary_large_image", title, description },
	};
}

export default async function CustomerStoryPage({
	params,
}: {
	params: BlogParams;
}) {
	const { slug } = await params;
	const story = customerStoriesData.find((item) => item.slug === slug);
	if (!story) notFound();

	return (
		<main className="min-h-screen bg-[#000000] text-white">
			<div className="mx-auto max-w-3xl px-4 py-24 md:py-32">
				<Link
					href="/"
					className="font-mono text-[12px] tracking-[-2%] uppercase text-[#FFFFFF99] hover:text-white transition-colors duration-300"
				>
					&larr; Back home
				</Link>

				<div className="mt-12 flex items-center gap-4">
					<img
						src={story.logo}
						alt={story.name}
						className="h-7 w-auto object-contain"
					/>
				</div>

				<h1 className="mt-8 text-[32px] leading-[38px] md:text-[44px] md:leading-[50px] tracking-[-4%] font-normal font-sans">
					<span className="text-[#FFFFFF99]">{story.headline.lead} </span>
					<span style={{ color: story.accent }}>{story.headline.emphasis}</span>
				</h1>

				<div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-8 border-y border-[#292929] py-10">
					{story.stats.map((stat) => (
						<div key={stat.label} className="flex flex-col gap-2">
							<span
								className="text-[40px] leading-none tracking-[-4%] font-light tabular-nums"
								style={{ color: story.accent }}
							>
								{stat.value}
							</span>
							<span className="font-mono text-[#FFFFFF99] text-[12px] tracking-[-2%] uppercase">
								{stat.label}
							</span>
						</div>
					))}
				</div>

				<blockquote className="mt-14 text-[22px] leading-[30px] md:text-[26px] md:leading-[34px] font-extralight tracking-[-2%]">
					&ldquo;{story.quote}&rdquo;
				</blockquote>
				<div className="mt-6 font-mono text-[13px] tracking-[-2%] leading-[18px]">
					<div className="text-white uppercase">{story.author.name}</div>
					<div className="text-[#FFFFFF99]">{story.author.title}</div>
				</div>

				<p className="mt-16 font-mono text-[12px] tracking-[-2%] uppercase text-[#4C4C4C]">
					{/* TODO: full case study content */}
					Full story coming soon.
				</p>
			</div>
		</main>
	);
}
