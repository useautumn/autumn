"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconArrowRight, IconQuotes } from "@/app/constant";

const testimonialsData = [
	{
		id: 1,
		quote:
			"Literally cannot imagine going without it. Thank you. We had some pretty crazy usage-based limitations for different features, as well as a free trial.",
		author: "DANIEL EDRISIAR",
	},
	{
		id: 2,
		quote: "Amazing product. Amazing founders.",
		author: "NIZZY",
	},
	{
		id: 3,
		quote:
			"Autumn is awesome. We've been happy customers since the very beginning - it was a no-brainer to be honest. The founders are in true founder mode.",
		author: "MAX PRILUTSKIY",
	},
	{
		id: 4,
		quote: "What migrating to Autumn does (scroll!)",
		author: "Ben Y",
	},
	{
		id: 5,
		quote:
			"Autumn fixed stripe. Trust me. Save you at least a week and potentially months of Stripe integration time. I wish we could have discovered Autumn earlier.",
		author: "Benny Kok",
	},
	{
		id: 6,
		quote:
			"@autumnpricing is so good it ruined every other tool for me. nothing else even feels right anymore",
		author: "Can Vardar",
	},
];

const Testimonials = () => {
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const progressRef = useRef<HTMLDivElement | null>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(true);
	// Only mount the hover-effect video on pointer:hover devices. Without this
	// every mobile visitor downloads one copy of the clip per testimonial (6×
	// the file) even though the hover effect they're gated on never triggers.
	const [isHoverDevice, setIsHoverDevice] = useState(false);
	useEffect(() => {
		setIsHoverDevice(window.matchMedia("(hover: hover)").matches);
	}, []);

	const handleScroll = useCallback(() => {
		if (scrollRef.current) {
			const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
			setCanScrollLeft(scrollLeft > 0);
			setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);

			if (progressRef.current) {
				const maxScroll = scrollWidth - clientWidth;
				const progress = maxScroll > 0 ? (scrollLeft / maxScroll) * 100 : 0;
				progressRef.current.style.transform = `translateX(${progress}%)`;
			}
		}
	}, []);

	useEffect(() => {
		handleScroll();
		window.addEventListener("resize", handleScroll);
		return () => window.removeEventListener("resize", handleScroll);
	}, [handleScroll]);

	const scrollByAmount = (amount: number) => {
		if (scrollRef.current) {
			scrollRef.current.scrollBy({ left: amount, behavior: "smooth" });
		}
	};

	return (
		<section className="w-full bg-[#000000] text-white overflow-hidden">
			<div className=" mx-auto">
				<div className="px-4 sm:px-6 md:px-4 lg:px-4 xl:px-22.75 pt-[48px] xl:pt-32 pb-[48px] flex flex-row items-start justify-between">
					<h2 className="w-full text-center md:w-auto md:text-left text-[30px] leading-[32px] sm:text-5xl md:text-[40px] font-normal tracking-[-5%]">
						<span className="text-[#FFFFFF99]">Built for </span>
						<span className="text-white">teams</span>
						<br className="sm:hidden" />
						<span className="text-white"> that move fast</span>
					</h2>
					<div className="hidden md:flex items-center space-x-4">
						<button
							onClick={() => scrollByAmount(-400)}
							disabled={!canScrollLeft}
							className="group p-1.5 bg-transparent cursor-pointer flex items-center justify-center transition-all duration-300 border border-[#292929]"
							type="button"
							aria-label="Previous testimonials"
						>
							<IconArrowLeft
								disabled={!canScrollLeft}
								className="w-6 h-6 text-gray-400 hover:text-white"
							/>
						</button>

						<button
							onClick={() => scrollByAmount(400)}
							disabled={!canScrollRight}
							className="group p-1.5 bg-transparent cursor-pointer flex items-center justify-center transition-all duration-300 border border-[#292929]"
							type="button"
							aria-label="Next testimonials"
						>
							<IconArrowRight
								disabled={!canScrollRight}
								className="w-6 h-6 text-gray-400 hover:text-white"
							/>
						</button>
					</div>
				</div>

				<div className="border-t border-[#1A1A1A] w-full" />

				<div className="px-0 xl:pl-22.75">
					<div
						ref={scrollRef}
						onScroll={handleScroll}
						className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar group/track"
						style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
					>
						{testimonialsData.map((testimonial) => (
							<div
								key={testimonial.id}
								className="group cursor-pointer shrink-0 w-[300px] sm:w-[300px] md:w-[360px] snap-start min-h-[360px] flex flex-col justify-between p-4 sm:p-10 border-l border-r border-b border-[#1A1A1A] transition-all duration-300 relative overflow-hidden"
							>
								{isHoverDevice && (
									<div className="absolute inset-x-0 bottom-0 h-[120%] pointer-events-none z-0 overflow-hidden">
										<div className="absolute inset-0 opacity-0 translate-y-6 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500 ease-out pointer-events-none z-0 hidden md:block">
											<video
												src="/images/testimonials/testimonial section.webm"
												autoPlay
												loop
												muted
												playsInline
												className="w-full h-full object-cover"
											/>
										</div>
									</div>
								)}
								<div className="absolute inset-x-0 bottom-0 h-[70%] bg-[linear-gradient(to_bottom,rgba(10,10,10,0)_0%,rgba(135,82,250,0.15)_40%,rgba(135,82,250,0.45)_70%,rgba(135,82,250,0.85)_90%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-0" />
								<div className="relative z-10 flex flex-col h-full justify-start">
									<IconQuotes className="w-8 h-8 text-[#4C4C4C] opacity-60 group-hover:text-[#9564FF] group-hover:opacity-100 transition-colors duration-500 mb-6" />
									<p className="text-white text-[14px] leading-[18px] sm:text-xl sm:leading-6 font-extralight tracking-[-2%] transition-colors duration-500">
										{testimonial.quote}
									</p>
								</div>
								<div className="relative z-10 font-mono text-sm tracking-[-2%] uppercase text-white opacity-60 group-hover:opacity-100 transition-colors duration-500 mt-33.5">
									{testimonial.author}
								</div>
							</div>
						))}
					</div>
				</div>
				<div className="border-t border-[#1A1A1A] w-full" />

				<div className="flex md:hidden justify-end px-4 mt-6">
					<div className="flex items-center gap-4">
						<button
							onClick={() => scrollByAmount(-400)}
							disabled={!canScrollLeft}
							className="p-1.5 bg-transparent flex items-center justify-center border border-[#292929]"
							type="button"
							aria-label="Previous testimonials"
						>
							<IconArrowLeft
								disabled={!canScrollLeft}
								className="w-6 h-6 text-white"
							/>
						</button>

						<button
							onClick={() => scrollByAmount(400)}
							disabled={!canScrollRight}
							className="p-1.5 bg-transparent flex items-center justify-center border border-[#292929]"
							type="button"
							aria-label="Next testimonials"
						>
							<IconArrowRight
								disabled={!canScrollRight}
								className="w-6 h-6 text-white"
							/>
						</button>
					</div>
				</div>
				<div className="flex justify-center mt-5 md:mt-10 pb-0 md:pb-10">
					<div className="w-[168px] hidden md:block h-1 bg-[#1A1A1A] rounded-full overflow-hidden relative">
						<div
							ref={progressRef}
							className="absolute left-0 top-0 h-full bg-[#8752FA] w-[84px] rounded-full"
							style={{ transform: "translateX(0%)" }}
						/>
					</div>
				</div>
			</div>

			<style jsx global>{`
				.hide-scrollbar::-webkit-scrollbar {
					display: none;
				}
				.arrow-corners {
					transform-box: fill-box;
					transform-origin: center;
					transition: transform 0.25s ease;
				}
				.group:hover .arrow-corners {
					transform: scale(1.4);
				}
			`}</style>
		</section>
	);
};

export default Testimonials;
