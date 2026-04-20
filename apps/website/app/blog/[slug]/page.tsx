import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { mdxComponents } from "@/components/blogComponents";
import { getAllPosts, getPostBySlug } from "@/lib/blogUtils";
import { BlogPostingJsonLd, BreadcrumbJsonLd } from "@/lib/structuredData";
import type { BlogParams } from "@/lib/types";

const SITE_URL = "https://useautumn.com";
const FALLBACK_OG_IMAGE = "/images/og-image.png";

export function generateStaticParams() {
	return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
	params,
}: {
	params: BlogParams;
}): Promise<Metadata> {
	const { slug } = await params;
	const post = getPostBySlug({ slug });
	if (!post) return { title: "Post Not Found" };

	const ogImage = post.image || FALLBACK_OG_IMAGE;

	return {
		title: post.title,
		description: post.description,
		alternates: { canonical: `/blog/${slug}` },
		openGraph: {
			title: post.title,
			description: post.description,
			type: "article",
			...(post.date ? { publishedTime: post.date } : {}),
			authors: [post.author],
			images: [{ url: ogImage }],
		},
		twitter: {
			card: "summary_large_image",
			title: post.title,
			description: post.description,
			images: [ogImage],
		},
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

export default async function BlogPostPage({ params }: { params: BlogParams }) {
	const { slug } = await params;
	const post = getPostBySlug({ slug });
	if (!post) notFound();

	const relatedPosts = getAllPosts()
		.filter((p) => p.slug !== post.slug)
		.slice(0, 3);

	return (
		<>
			<BlogPostingJsonLd post={post} />
			<BreadcrumbJsonLd
				items={[
					{ name: "Home", url: SITE_URL },
					{ name: "Blog", url: `${SITE_URL}/blog` },
					{ name: post.title, url: `${SITE_URL}/blog/${post.slug}` },
				]}
			/>
			<div className="py-16 md:py-24 bg-[#0F0F0F]">
				<div className="max-w-[720px] mx-auto px-4 xl:px-0">
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

					<header className="mb-12">
						<div className="flex flex-wrap items-center gap-3 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66] mb-4">
							<span>{formatDate(post.date)}</span>
							<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
							<span>{post.author}</span>
							<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
							<span>{post.readingTimeMinutes} min read</span>
						</div>
						<h1 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1] font-sans text-white mb-4">
							{post.title}
						</h1>
						{post.description && (
							<p className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans mb-4">
								{post.description}
							</p>
						)}
						{post.tags.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{post.tags.map((tag) => (
									<Link
										key={tag}
										href={`/blog/tag/${tag}`}
										className="font-mono text-[11px] md:text-[12px] uppercase tracking-[-2%] text-[#FFFFFF99] hover:text-[#9564ff] border border-[#292929] hover:border-[#3f3f3f] px-2 py-1 transition-colors duration-300"
									>
										{tag}
									</Link>
								))}
							</div>
						)}
					</header>

					{post.image && (
						<div className="relative w-full aspect-[2/1] overflow-hidden border border-[#292929] mb-12">
							<Image
								src={post.image}
								alt={post.title}
								fill
								className="object-cover"
								priority
							/>
						</div>
					)}

					<hr className="border-[#292929] mb-12" />

					<article className="prose prose-invert prose-lg max-w-none">
						<MDXRemote source={post.source} components={mdxComponents} />
					</article>

					{relatedPosts.length > 0 && (
						<section className="mt-24 pt-12 border-t border-[#292929]">
							<h2 className="text-[22px] md:text-[28px] font-normal tracking-[-2%] leading-[1.15] font-sans text-white mb-8">
								More from the blog
							</h2>
							<div className="flex flex-col gap-1">
								{relatedPosts.map((p) => (
									<Link
										key={p.slug}
										href={`/blog/${p.slug}`}
										className="group flex flex-col gap-2 border border-[#292929] hover:border-[#3f3f3f] hover:bg-[#080808] transition-colors duration-300 p-5 md:p-6"
									>
										<div className="flex flex-wrap items-center gap-3 font-mono text-[11px] md:text-[12px] uppercase tracking-[-2%] text-[#FFFFFF66]">
											<span>{formatDate(p.date)}</span>
											<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
											<span>{p.readingTimeMinutes} min read</span>
										</div>
										<h3 className="font-sans text-[16px] md:text-[18px] tracking-[-2%] leading-[1.25] font-normal text-white group-hover:text-[#9564ff] transition-colors duration-300">
											{p.title}
										</h3>
										{p.description && (
											<p className="text-[13px] md:text-[14px] leading-5 text-[#FFFFFF99] font-light font-sans line-clamp-2">
												{p.description}
											</p>
										)}
									</Link>
								))}
							</div>
						</section>
					)}
				</div>
			</div>
		</>
	);
}
