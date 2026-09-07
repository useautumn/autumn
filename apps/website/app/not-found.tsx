import Image from "next/image";
import Link from "next/link";
import Navbar from "@/components/navbar";
import type { PageStyle } from "@/lib/types";

const RECOVERY_LINKS = [
	{ label: "Home", href: "/" },
	{ label: "Developer resources", href: "/developers" },
	{ label: "Documentation", href: "https://docs.useautumn.com/welcome" },
	{ label: "Sitemap", href: "/sitemap.xml" },
	{ label: "llms.txt", href: "/llms.txt" },
];

export default function NotFound() {
	return (
		<div
			className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-[#0f0f0f]"
			style={
				{ "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" } as PageStyle
			}
		>
			<div className="relative flex w-full flex-1 flex-col px-4 pt-5 md:px-(--page-pad)">
				<Navbar animateIntro={false} />
				<main className="relative flex min-h-[calc(100dvh-100px)] flex-1 items-center justify-center overflow-hidden border-x border-[#292929] px-4 text-center">
					<Image
						src="/images/404.svg"
						alt=""
						aria-hidden="true"
						fill
						sizes="100vw"
						className="object-cover object-center"
						priority
					/>
					<div className="relative z-10 flex max-w-2xl flex-col items-center">
						<Image
							src="/images/autumn-notfound.svg"
							alt="Autumn"
							width={64}
							height={64}
							className="mb-6 size-14 md:size-16"
						/>
						<h1 className="text-balance text-5xl font-normal text-white md:text-6xl">
							Page not found
						</h1>
						<p className="mt-4 text-pretty text-base leading-7 text-white/60 md:text-lg">
							The page does not exist or has moved. People and agents can
							recover through the site map, developer index, documentation, or
							machine-readable llms.txt file.
						</p>
						<nav aria-label="Page recovery" className="mt-8">
							<ul className="flex flex-wrap justify-center gap-3">
								{RECOVERY_LINKS.map((link) => (
									<li key={link.href}>
										<Link
											className="inline-flex min-h-11 items-center border border-white/20 bg-black/70 px-4 text-sm text-white hover:bg-white hover:text-black"
											href={link.href}
										>
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</nav>
					</div>
				</main>
			</div>
		</div>
	);
}
