import type { MDXComponents } from "mdx/types";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { mdxComponents } from "@/components/blogComponents";
import JsonLd from "@/components/json-ld";
import {
	getAlogDocBySlug,
	getAllAlogDocs,
	type AlogSummary,
} from "@/lib/alogUtils";
import { breadcrumbSchema, techArticleSchema } from "@/lib/seo";
import type { BlogParams } from "@/lib/types";

export function generateStaticParams() {
	return getAllAlogDocs().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
	params,
}: {
	params: BlogParams;
}): Promise<Metadata> {
	const { slug } = await params;
	const doc = getAlogDocBySlug({ slug });
	if (!doc) return { title: "Not Found" };

	return {
		title: doc.title,
		description: doc.description,
		alternates: { canonical: `/alog/${slug}` },
		openGraph: {
			title: doc.title,
			description: doc.description,
			type: "article",
			siteName: "Autumn",
			...(doc.date ? { publishedTime: doc.date } : {}),
			...(doc.updated ? { modifiedTime: doc.updated } : {}),
			authors: [doc.author],
		},
		twitter: {
			card: "summary",
			title: doc.title,
			description: doc.description,
		},
	};
}

function formatDate(value: string | null) {
	if (!value) return "";
	return new Date(value).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

async function loadMdxContent({ slug }: { slug: string }) {
	try {
		const mod = await import(`@/content/alog/${slug}.mdx`);
		return mod.default as React.ComponentType<{ components?: MDXComponents }>;
	} catch {
		return null;
	}
}

export default async function AlogDocPage({ params }: { params: BlogParams }) {
	const { slug } = await params;
	const doc = getAlogDocBySlug({ slug });
	if (!doc) notFound();

	const Content = await loadMdxContent({ slug });
	if (!Content) notFound();

	const bySlug = new Map<string, AlogSummary>(
		getAllAlogDocs().map((entry) => [entry.slug, entry]),
	);
	const related = doc.relatedAlog
		.map((relatedSlug) => bySlug.get(relatedSlug))
		.filter((entry): entry is AlogSummary => Boolean(entry));

	return (
		<div className="py-12 md:py-20 bg-[#0F0F0F]">
			<JsonLd
				data={[
					techArticleSchema(doc),
					breadcrumbSchema([
						{ name: "Alog", path: "/alog" },
						{ name: doc.title, path: `/alog/${doc.slug}` },
					]),
				]}
			/>
			<div className="max-w-[760px] mx-auto px-4 xl:px-0">
				<div className="flex items-center justify-between gap-4 mb-8">
					<Link
						href="/alog"
						className="inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[-2%] text-[#FFFFFF66] hover:text-white transition-colors duration-300"
					>
						<svg
							width="14"
							height="14"
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
						Alog
					</Link>
					<a
						href={`/alog/${doc.slug}.md`}
						className="font-mono text-[12px] uppercase tracking-[-2%] text-[#9564ff] hover:text-[#b08aff] transition-colors duration-300"
					>
						View as .md
					</a>
				</div>

				<header className="mb-10 pb-8 border-b border-[#292929]">
					<div className="flex items-center gap-3 font-mono text-[11px] md:text-[12px] uppercase tracking-[-1%] text-[#FFFFFF66] mb-4">
						<span className="text-[#9564ff]">{doc.category}</span>
						<span className="w-1 h-1 bg-[#FFFFFF44] rounded-full" />
						<span>Updated {formatDate(doc.updated)}</span>
					</div>
					<h1 className="text-[28px] md:text-[36px] font-normal tracking-[-2%] leading-[1.1] font-sans text-white mb-4">
						{doc.title}
					</h1>
					<p className="text-[15px] md:text-[17px] leading-6 text-[#FFFFFFCC] font-light font-sans">
						{doc.summary}
					</p>
				</header>

				<article className="prose prose-invert max-w-none prose-headings:font-sans prose-headings:tracking-[-2%] prose-h2:text-[20px] prose-h2:mt-10 prose-h2:mb-3 prose-h3:text-[16px] prose-p:text-[#D5D5D5] prose-li:text-[#D5D5D5] prose-p:text-[15px] prose-li:text-[15px] prose-code:before:content-none prose-code:after:content-none [&>h1:first-child]:hidden [&>h1:first-child+blockquote]:hidden">
					<Content components={mdxComponents} />
				</article>

				{(related.length > 0 || doc.relatedDocs.length > 0) && (
					<div className="mt-12 pt-8 border-t border-[#292929] grid grid-cols-1 sm:grid-cols-2 gap-8">
						{doc.relatedDocs.length > 0 && (
							<div>
								<h2 className="font-mono text-[12px] uppercase tracking-[-1%] text-[#FFFFFF66] mb-3">
									Autumn docs
								</h2>
								<ul className="flex flex-col gap-2">
									{doc.relatedDocs.map((docLink) => (
										<li key={docLink.href}>
											<a
												href={docLink.href}
												target="_blank"
												rel="noopener noreferrer"
												className="text-[14px] text-[#9564ff] hover:text-[#b08aff] underline underline-offset-2"
											>
												{docLink.label}
											</a>
										</li>
									))}
								</ul>
							</div>
						)}
						{related.length > 0 && (
							<div>
								<h2 className="font-mono text-[12px] uppercase tracking-[-1%] text-[#FFFFFF66] mb-3">
									Related Alog
								</h2>
								<ul className="flex flex-col gap-2">
									{related.map((entry) => (
										<li key={entry.slug}>
											<Link
												href={`/alog/${entry.slug}`}
												className="text-[14px] text-[#9564ff] hover:text-[#b08aff] underline underline-offset-2"
											>
												{entry.title}
											</Link>
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
