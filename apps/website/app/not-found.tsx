"use client";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { IconArrowRightSmall } from "@/app/constant";
import Navbar from "@/components/navbar";
import type { PageStyle } from "@/components/website-types";

const pageStyle: PageStyle = {
	"--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))",
};

export default function NotFound() {
	return (
		<div
			className="w-full min-h-screen overflow-x-hidden overflow-y-auto bg-[#0f0f0f] flex flex-col"
			style={pageStyle}
		>
			<div className="relative w-full px-4 md:px-(--page-pad) pt-5 flex-1 block">
				<div className="absolute pointer-events-none top-0 bottom-0 left-4 md:left-(--page-pad) border-l border-[#292929] z-50" />
				<div className="absolute pointer-events-none top-0 bottom-0 right-4 md:right-(--page-pad) border-r border-[#292929] z-50" />

				<Navbar animateIntro={false} />

				<div className="relative flex-1 w-full min-h-[calc(100vh-100px)] flex flex-col items-center justify-center -mt-[1px]">
					<div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ duration: 1, ease: "easeOut" }}
							className="absolute inset-0 w-full h-full"
						>
							<Image
								src="/images/404.svg"
								alt="404 Background City Base"
								fill
								className="object-cover object-center"
								priority
							/>
						</motion.div>

						<motion.div
							initial={{ opacity: 0, display: "none" }}
							animate={{
								opacity: [0, 1, 0.8, 1, 0.6, 0],
								display: ["block", "block", "block", "block", "block", "none"],
								x: [0, -15, 20, -10, 15, 0],
								y: [0, 8, -15, 5, -5, 0],
								filter: [
									"brightness(3) contrast(200%) hue-rotate(90deg)",
									"brightness(2) contrast(300%) invert(30%)",
									"brightness(1.5) contrast(150%) hue-rotate(-45deg)",
									"brightness(3) contrast(200%) hue-rotate(180deg)",
									"brightness(2) contrast(150%)",
									"brightness(1)",
								],
								clipPath: [
									"inset(10% 0% 60% 0%)",
									"inset(20% 0% 30% 0%)",
									"inset(80% 0% 5% 0%)",
									"inset(40% 0% 40% 0%)",
									"inset(5% 0% 80% 0%)",
									"inset(0% 0% 0% 0%)",
								],
							}}
							transition={{
								duration: 0.45,
								ease: "easeInOut",
								delay: 0.1,
								times: [0, 0.2, 0.6, 0.75, 0.9, 1],
							}}
							className="absolute inset-0 w-full h-full mix-blend-screen pointer-events-none z-10"
						>
							<Image
								src="/images/404.svg"
								alt="404 Background City Glitch"
								fill
								className="object-cover object-center scale-105"
								priority
							/>
						</motion.div>
					</div>

					<div className="relative z-10 flex flex-col items-center justify-center w-full px-4 text-center mt-[-40px]">
						<Image
							src="/images/autumn-notfound.svg"
							alt="Autumn Logo"
							width={64}
							height={64}
							className="w-[56px] h-[56px] md:w-[64px] md:h-[64px] mb-6"
						/>

						<h1 className="text-white text-[48px] md:text-[64px] font-normal tracking-[-3%] mb-3 font-sans leading-[1.1]">
							Page not found
						</h1>

						<p className="text-[#FFFFFF99] font-light text-[15px] md:text-[18px] mb-8 tracking-[-1%] text-center">
							The page you are looking for doesn&apos;t exist or has been moved.
						</p>

						<Link href="/">
							<button
								type="button"
								className="group relative flex items-stretch justify-between transition-colors duration-300 bg-[#8752FA] hover:bg-[#7641E8] w-[200px] md:w-[210px] h-[48px] md:h-[54px] border border-[#8752FA]"
							>
								<span className="text-white text-[14px] md:text-[15px] pl-6 flex items-center font-sans tracking-[-1%]">
									Back to home
								</span>
								<div className="flex items-center justify-center w-[36px] md:w-[40px] transition-colors duration-300 bg-white text-[#8752FA] m-1 md:m-1.5 shrink-0">
									<IconArrowRightSmall className="w-4 h-4" />
								</div>
							</button>
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}
