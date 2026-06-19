import { motion } from "motion/react";
import Link from "next/link";
import { CTALines, IconCTAStart } from "@/app/constant";

export function StoryHeading() {
	return (
		<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pt-12 xl:pt-24 px-4 xl:px-22.75 relative z-10">
			<div>
				<h2 className="text-[28px] sm:text-[32px] lg:text-[40px] leading-[1.1] font-sans tracking-[-2%] font-normal">
					<span className="text-[#FFFFFF99]">Built on Autumn.</span>{" "}
					<span className="text-white">Loved by teams.</span>
				</h2>
				<p className="mt-4 max-w-xl text-[15px] lg:text-[16px] font-sans leading-relaxed tracking-[-1%] font-light text-[#FFFFFF99]">
					The best startups run their billing, usage and AI credits on Autumn.
				</p>
			</div>
			<div className="hero-cta shrink-0">
				<Link href="/customers">
					<motion.div
						initial="initial"
						whileHover="hover"
						whileTap="tap"
						className="relative"
					>
						<div className="relative overflow-hidden flex items-center cursor-pointer justify-between px-4 py-3.5 w-full md:w-56 font-sans bg-[#9564ff] hover:bg-[#7D46F4] active:bg-[#7D46F4] transition-colors duration-300 whitespace-nowrap">
							<CTALines />
							<span className="relative z-10 tracking-tight text-white font-medium">
								View customer stories
							</span>
							<span className="relative z-10">
								<IconCTAStart />
							</span>
						</div>
					</motion.div>
				</Link>
			</div>
		</div>
	);
}
