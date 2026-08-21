import Link from "next/link";
import Footer from "@/components/footer";
import Navbar from "@/components/navbar";
import type { CompanyPageContent } from "@/lib/companyContent";
import type { PageStyle } from "@/lib/types";

export default function CompanyPage({
	content,
}: {
	content: CompanyPageContent;
}) {
	return (
		<div
			className="min-h-dvh w-full overflow-x-clip bg-black text-white"
			style={
				{ "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" } as PageStyle
			}
		>
			<div className="relative mx-auto w-full px-4 pt-5 md:px-(--page-pad)">
				<Navbar />
				<main className="border-x border-[#292929] bg-[#0f0f0f] px-6 py-16 sm:px-10 md:py-24 lg:px-20">
					<div className="mx-auto max-w-3xl">
						<h1 className="text-balance text-4xl font-medium sm:text-5xl">
							{content.title}
						</h1>
						<p className="mt-6 text-pretty text-lg leading-8 text-white/70">
							{content.intro}
						</p>

						<div className="mt-16 grid gap-12">
							{content.sections.map((section) => (
								<section key={section.title}>
									<h2 className="text-balance text-2xl font-medium">
										{section.title}
									</h2>
									<p className="mt-4 text-pretty leading-7 text-white/70">
										{section.content}
									</p>
									{section.links && (
										<ul className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
											{section.links.map((link) => (
												<li key={link.href}>
													<Link
														className="text-[#b08aff] underline underline-offset-4"
														href={link.href}
													>
														{link.label}
													</Link>
												</li>
											))}
										</ul>
									)}
								</section>
							))}
						</div>
					</div>
				</main>
				<Footer />
			</div>
		</div>
	);
}
