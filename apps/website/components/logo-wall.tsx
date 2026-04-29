"use client";

import { cn } from "@/lib/utils";

const LOGOS = [
	{ id: 1, name: "Mintlify", src: "/images/logos/mintlify_logo.svg.svg", className: "scale-90 md:scale-70" },
	{ id: 3, name: "Firecrawl", src: "/images/logos/Firecrawl.svg.svg", className: "scale-95 md:scale-75 -translate-y-0.5" },
	{ id: 4, name: "Mastra", src: "/images/logos/Mastra.svg.svg", className: "scale-105 md:scale-95" },
	{ id: 2, name: "Browser Use", src: "/images/logos/Browser use.svg", className: "scale-85 md:scale-65" },
	{ id: 5, name: "T3.chat", src: "/images/logos/T3_svg.svg", className: "scale-65 md:scale-55" },
];

const NUM_MOBILE_COLS = 3;
const NUM_DESKTOP_COLS = 5;

export default function LogoWall() {
	return (
		<section className="w-full bg-[#0F0F0F]"
		style={{
			backgroundImage:
				"radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
			backgroundSize: "14px 14px",
		}}>
			<div className="flex flex-col">
				<div className="px-4 xl:px-22.75 pt-10.5 flex items-center justify-center">
					<span className="font-sans text-[14px] font-light text-[#FFFFFF99] tracking-[-2%] leading-5">
						Powering millions of customers for growing startups 
					</span>
				</div>

				{/* Logo grid — 2 cols on mobile, 3 cols on desktop */}
			<div className="flex-1 flex flex-wrap justify-center md:grid md:grid-cols-5 px-4 py-4 md:py-0">
				{LOGOS.map((logo) => (
					<div
						key={logo.id}
						className="flex items-center justify-center min-h-[50px] md:min-h-[100px] border-[#292929] w-1/3 md:w-auto"
					>
						{logo.src && (
							<img
								src={logo.src}
								alt={logo.name}
								className={cn(
									"h-5 md:h-7 w-auto max-w-full object-contain",
									logo.className
								)}
								loading="lazy"
							/>
						)}
					</div>
				))}
			</div>
			</div>
		</section>
	);
}
