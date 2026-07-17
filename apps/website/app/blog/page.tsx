import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AgentNote from "@/components/agent-note";
import DocsCallout from "@/components/docs-callout";
import JsonLd from "@/components/json-ld";
import { getAllPosts } from "@/lib/blogUtils";
import { breadcrumbSchema } from "@/lib/seo";

export const metadata: Metadata = {
	title: "Blog",
	description:
		"Thoughts on billing infrastructure, usage-based pricing, and building for AI startups.",
	alternates: { canonical: "/blog" },
};

function stripHtml(html: string) {
	return html.replace(/<[^>]*>/g, "");
}

function formatDate(dateString: string | null) {
	if (!dateString) return "";
	return new Date(dateString).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export default function BlogListingPage() {
	const posts = getAllPosts();

	return (
		<div className="py-16 md:py-24 bg-[#0F0F0F]">
			<JsonLd data={breadcrumbSchema([{ name: "Blog", path: "/blog" }])} />
			<div className="max-w-[800px] mx-auto px-4 xl:px-0">
				<h1 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1] font-sans mb-4">
					<span className="text-[#FFFFFF99] font-light">From the </span>
					<span className="text-white">Blog</span>
				</h1>
				<p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans mb-4">
					Thoughts on billing infrastructure, usage-based pricing, and building
					for AI startups.
				</p>
				<div className="flex flex-col gap-1.5 mb-16">
					<AgentNote>
						If you're an agent, append{" "}
						<code className="text-[#FFFFFF99] font-mono text-[12px]">.md</code> to
						any post for raw markdown, read the{" "}
						<Link
							href="/llms.txt"
							className="text-[#9564ff] hover:text-[#b08aff] underline underline-offset-2"
						>
							llms.txt
						</Link>{" "}
						index, or browse the{" "}
						<Link
							href="/alog"
							className="text-[#9564ff] hover:text-[#b08aff] underline underline-offset-2"
						>
							Alog
						</Link>
						.
					</AgentNote>
					<DocsCallout />
				</div>

				{posts.length === 0 && (
					<p className="text-[#FFFFFF66] text-center py-16 font-light">
						No posts yet. Check back soon.
					</p>
				)}

				<div className="flex flex-col">
					{posts.map((post) => (
						<Link
							key={post.slug}
							href={`/blog/${post.slug}`}
							className="group flex items-center gap-6 border-b border-[#292929] last:border-b-0 transition-colors duration-300 py-10 md:py-12"
						>
							{post.image && (
								<div className="relative hidden sm:block w-[140px] md:w-[180px] aspect-[2/1] overflow-hidden shrink-0">
									<Image
										src={post.image}
										alt={post.title}
										fill
										className="object-cover"
										sizes="(max-width: 640px) 0px, (max-width: 768px) 140px, 180px"
									/>
								</div>
							)}
							<div className="flex flex-col gap-3 flex-1 min-w-0">
								<div className="flex items-center gap-3 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66]">
									<span>{formatDate(post.date)}</span>
									<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
									<span>{post.author}</span>
								</div>
								<h2 className="font-sans text-[18px] md:text-[22px] tracking-[-2%] leading-[1.25] font-normal text-white group-hover:text-[#9564ff] transition-colors duration-300">
									{post.title}
								</h2>
								{post.description && (
								<p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans">
									{stripHtml(post.description)}
								</p>
								)}
							</div>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
