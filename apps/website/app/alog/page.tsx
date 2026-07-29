import type { Metadata } from "next";
import Link from "next/link";
import DocsCallout from "@/components/docs-callout";
import JsonLd from "@/components/json-ld";
import { getAlogDocsByCategory } from "@/lib/alogUtils";
import { breadcrumbSchema } from "@/lib/seo";

export const metadata: Metadata = {
	title: "Alog — Agent Reference",
	description:
		"Structured, factual reference pages about Autumn for AI agents to crawl, quote, and compare. Every page is available as markdown.",
	alternates: { canonical: "/alog" },
};

export default function AlogIndexPage() {
	const groups = getAlogDocsByCategory();

	return (
		<div className="py-16 md:py-24 bg-[#0F0F0F]">
			<JsonLd data={breadcrumbSchema([{ name: "Alog", path: "/alog" }])} />
			<div className="max-w-[820px] mx-auto px-4 xl:px-0">
				<header className="mb-12">
					<div className="font-mono text-[12px] md:text-[14px] uppercase tracking-[-2%] text-[#FFFFFF66] mb-4">
						{"//"} Agent reference
					</div>
					<h1 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1] font-sans mb-4 text-white">
						Alog
					</h1>
					<p className="text-[14px] md:text-[16px] leading-6 text-[#FFFFFF99] font-light font-sans max-w-[640px]">
						Autumn content for your agent. Append{" "}
						<code className="text-[#e0e0e0] font-mono text-[13px]">.md</code> to
						any page for raw markdown, or read the{" "}
						<Link
							href="/llms.txt"
							className="text-[#9564ff] hover:text-[#b08aff] underline underline-offset-2"
						>
							llms.txt
						</Link>{" "}
						and{" "}
						<Link
							href="/llms-full.txt"
							className="text-[#9564ff] hover:text-[#b08aff] underline underline-offset-2"
						>
							llms-full.txt
						</Link>{" "}
						indexes.
					</p>
				</header>

				<div className="mb-12">
					<DocsCallout />
				</div>

				<div className="flex flex-col gap-12">
					{groups.map((group) => (
						<section key={group.category}>
							<h2 className="flex items-center gap-2 font-mono text-[13px] md:text-[14px] uppercase tracking-[-1%] text-white mb-5">
								<span className="w-[8px] h-[8px] bg-[#9564ff]" />
								{group.category}
							</h2>
							<ul className="flex flex-col border-t border-[#292929]">
								{group.docs.map((doc) => (
									<li key={doc.slug}>
										<Link
											href={`/alog/${doc.slug}`}
											className="group flex flex-col gap-1.5 border-b border-[#292929] py-5 hover:bg-[#141414] transition-colors duration-300 px-3 -mx-3"
										>
											<div className="flex items-baseline justify-between gap-4">
												<span className="font-sans text-[16px] md:text-[18px] tracking-[-2%] text-white group-hover:text-[#b08aff] transition-colors duration-300">
													{doc.title}
												</span>
												<span className="font-mono text-[11px] uppercase tracking-[-1%] text-[#FFFFFF44] shrink-0">
													/alog/{doc.slug}
												</span>
											</div>
											<span className="text-[13px] md:text-[14px] leading-5 text-[#FFFFFF99] font-light font-sans">
												{doc.summary}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</section>
					))}
				</div>
			</div>
		</div>
	);
}
