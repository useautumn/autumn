import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllTags, getPostsByTag } from "@/lib/blogUtils";

export function generateStaticParams() {
	return getAllTags().map((tag) => ({ tag }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ tag: string }>;
}): Promise<Metadata> {
	const { tag } = await params;
	const title = `Posts tagged "${tag}" - Autumn Blog`;
	return {
		title,
		description: `Autumn blog posts tagged ${tag} — billing infrastructure, pricing, and engineering notes.`,
		alternates: { canonical: `/blog/tag/${tag}` },
	};
}

function formatDate(dateString: string | null) {
	if (!dateString) return "";
	return new Date(dateString).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export default async function TagArchivePage({
	params,
}: {
	params: Promise<{ tag: string }>;
}) {
	const { tag } = await params;
	const posts = getPostsByTag({ tag });
	if (posts.length === 0) notFound();

	return (
		<div className="py-16 md:py-24 bg-[#0F0F0F]">
			<div className="max-w-[800px] mx-auto px-4 xl:px-0">
				<Link
					href="/blog"
					className="inline-flex items-center gap-2 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66] hover:text-white transition-colors duration-300 mb-10"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						className="rotate-180"
						aria-hidden="true"
					>
						<title>Back arrow</title>
						<path
							d="M6 3L11 8L6 13"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
					Back to blog
				</Link>

				<h1 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1] font-sans mb-4">
					<span className="text-[#FFFFFF99] font-light">Posts tagged </span>
					<span className="text-white">&ldquo;{tag}&rdquo;</span>
				</h1>
				<p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans mb-16">
					{posts.length} {posts.length === 1 ? "post" : "posts"} tagged with{" "}
					<span className="font-mono uppercase">{tag}</span>.
				</p>

				<div className="flex flex-col gap-1">
					{posts.map((post) => (
						<div
							key={post.slug}
							className="group relative flex items-center gap-6 border border-[#292929] hover:border-[#3f3f3f] hover:bg-[#080808] transition-colors duration-300 p-6 md:p-8"
						>
							<div className="flex flex-col gap-3 flex-1 min-w-0">
								<div className="flex flex-wrap items-center gap-3 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66]">
									<span>{formatDate(post.date)}</span>
									<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
									<span>{post.author}</span>
									<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
									<span>{post.readingTimeMinutes} min read</span>
								</div>
								<h2 className="font-sans text-[18px] md:text-[22px] tracking-[-2%] leading-[1.25] font-normal text-white group-hover:text-[#9564ff] transition-colors duration-300">
									<Link
										href={`/blog/${post.slug}`}
										className="relative z-10 after:absolute after:inset-0 after:content-['']"
									>
										{post.title}
									</Link>
								</h2>
								{post.description && (
									<p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans">
										{post.description}
									</p>
								)}
								{post.tags.length > 0 && (
									<div className="flex flex-wrap gap-2 relative z-20">
										{post.tags.map((t) => (
											<Link
												key={t}
												href={`/blog/tag/${t}`}
												className="font-mono text-[11px] md:text-[12px] uppercase tracking-[-2%] text-[#FFFFFF99] hover:text-[#9564ff] border border-[#292929] hover:border-[#3f3f3f] px-2 py-1 transition-colors duration-300"
											>
												{t}
											</Link>
										))}
									</div>
								)}
							</div>
							{post.image && (
								<div className="relative hidden sm:block w-[140px] md:w-[180px] aspect-[3/2] overflow-hidden shrink-0">
									<Image
										src={post.image}
										alt={post.title}
										fill
										className="object-cover"
									/>
								</div>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
