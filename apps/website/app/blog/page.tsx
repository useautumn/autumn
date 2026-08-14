import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
			<div className="max-w-[840px] mx-auto px-4 xl:px-0">
				<h1 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1] font-sans mb-4">
					<span className="text-[#FFFFFF99] font-light">From the </span>
					<span className="text-white">Blog</span>
				</h1>
				<p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans mb-16">
					Thoughts on billing infrastructure, usage-based pricing, and building
					for AI startups.
				</p>

				{posts.length === 0 && (
					<p className="text-[#FFFFFF66] text-center py-16 font-light">
						No posts yet. Check back soon.
					</p>
				)}

				<div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12 md:gap-y-16">
					{posts.map((post) => (
						<Link
							key={post.slug}
							href={`/blog/${post.slug}`}
							className="group flex flex-col gap-4"
						>
							{post.image && (
								<div className="relative w-full aspect-[2/1] overflow-hidden shrink-0">
									<Image
										src={post.image}
										alt={post.title}
										fill
										className="object-cover"
										sizes="(max-width: 768px) 100vw, 540px"
									/>
								</div>
							)}
							<div className="flex flex-col gap-3 min-w-0">
								<h2 className="font-sans text-[18px] md:text-[20px] tracking-[-2%] leading-[1.25] font-normal text-white group-hover:text-[#9564ff] transition-colors duration-300">
									{post.title}
								</h2>
								{post.description && (
									<p className="text-[12px] md:text-[13px] leading-[1.5] text-[#FFFFFF99] font-light font-sans">
										{stripHtml(post.description)}
									</p>
								)}
								<div className="flex items-center gap-3 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66] mt-1">
									<span>{post.author}</span>
									<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
									<span>{formatDate(post.date)}</span>
								</div>
							</div>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
