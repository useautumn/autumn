import type { MDXComponents } from "mdx/types";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { mdxComponents } from "@/components/blogComponents";
import JsonLd from "@/components/json-ld";
import { getAllPosts, getPostBySlug } from "@/lib/blogUtils";
import { blogPostingSchema, breadcrumbSchema } from "@/lib/seo";
import type { BlogParams } from "@/lib/types";

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

	return {
		title: post.title,
		description: post.description,
		alternates: { canonical: `/blog/${slug}` },
		openGraph: {
			title: post.title,
			description: post.description,
			type: "article",
			siteName: "Autumn",
			...(post.date ? { publishedTime: post.date } : {}),
			authors: [post.author],
			...(post.image && {
				images: [
					{ url: post.image, width: 1200, height: 630, alt: post.title },
				],
			}),
		},
		twitter: {
			card: "summary_large_image",
			title: post.title,
			description: post.description,
			...(post.image ? { images: [post.image] } : {}),
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

async function loadMdxContent({ slug }: { slug: string }) {
	try {
		const mod = await import(`@/content/blog/${slug}.mdx`);
		return mod.default as React.ComponentType<{ components?: MDXComponents }>;
	} catch {
		return null;
	}
}

export default async function BlogPostPage({ params }: { params: BlogParams }) {
	const { slug } = await params;
	const post = getPostBySlug({ slug });
	if (!post) notFound();

	const Content = await loadMdxContent({ slug });
	if (!Content) notFound();

	const heroRegistry = mdxComponents as unknown as Record<
		string,
		React.ComponentType
	>;
	const HeroComponent = post.heroComponent
		? heroRegistry[post.heroComponent]
		: null;

	return (
		<div className="py-16 md:py-24 bg-[#0F0F0F]">
			<JsonLd
				data={[
					blogPostingSchema(post),
					breadcrumbSchema([
						{ name: "Blog", path: "/blog" },
						{ name: post.title, path: `/blog/${post.slug}` },
					]),
				]}
			/>
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
					<div className="flex items-center gap-3 font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66] mb-4">
						<span>{formatDate(post.date)}</span>
						<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
						<span>{post.author}</span>
					</div>
					<h1 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1] font-sans text-white mb-4">
						{post.title}
					</h1>
					{post.description && (
						<p
							className="text-[14px] md:text-[16px] leading-5 text-[#FFFFFF99] font-light font-sans [&_a]:text-[#9564ff] [&_a:hover]:text-[#b08aff] [&_a]:underline [&_a]:underline-offset-2 [&_a]:transition-colors"
							// biome-ignore lint/security/noDangerouslySetInnerHtml: blog descriptions are trusted frontmatter content
							dangerouslySetInnerHTML={{ __html: post.description }}
						/>
					)}
				</header>

				{HeroComponent ? (
					<div className="mb-12">
						<HeroComponent />
					</div>
				) : (
					post.image && (
						<div className="relative w-full aspect-[2/1] overflow-hidden border border-[#292929] bg-[#080808] mb-12">
							<Image
								src={post.image}
								alt={post.title}
								fill
								className="object-contain"
								priority
								sizes="(max-width: 768px) 100vw, 720px"
							/>
						</div>
					)
				)}

				<hr className="border-[#292929] mb-12" />

				<article className="prose prose-invert prose-lg max-w-none prose-p:text-[#E5E5E5] prose-li:text-[#E5E5E5] prose-code:before:content-none prose-code:after:content-none">
					<Content components={mdxComponents} />
				</article>
			</div>
		</div>
	);
}
