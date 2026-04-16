"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { AnimatedPlusMinus, faqData } from "@/app/constant";
import { cn } from "@/lib/utils";

export default function FAQ() {
	const [openId, setOpenId] = useState<number | null>(3);

	const springConfig = {
		type: "spring" as const,
		stiffness: 280,
		damping: 32,
		mass: 1,
		restDelta: 0.01,
	};

	const toggleAccordion = (id: number) => {
		setOpenId(openId === id ? null : id);
	};

	return (
		<section
			className="bg-[#000000] text-white overflow-hidden relative border-b border-[#292929]"
			style={{
				width: "calc(100% + var(--page-pad) * 2)",
				marginLeft: "calc(var(--page-pad) * -1)",
				paddingLeft: "var(--page-pad)",
				paddingRight: "var(--page-pad)",
			}}
		>
			<div className="grid grid-cols-1 lg:grid-cols-2 w-full min-h-[500px]">
				<div className="lg:border-r border-b border-[#292929] pl-4 md:pl-4 xl:pl-[90px] pr-6 lg:pr-12 py-12 md:py-[60px] flex flex-col justify-center">
					<h2 className="text-[30px] md:text-[40px] font-normal tracking-[-2%] leading-[1.1]">
						<span className="text-[#FFFFFF99] font-light">
							Frequently Asked
						</span>
						<br />
						<span className="text-white font-normal">Questions</span>
					</h2>
				</div>

				<div className="hidden lg:block border-b border-[#292929] h-full w-full"></div>

				<div className="hidden lg:block lg:border-r border-[#292929] h-full w-full relative z-0">
					<div className="absolute bottom-0 w-full h-full pb-32"></div>
				</div>

				<div className="flex flex-col h-full w-full relative z-10 ">
					{faqData.map((faq) => {
						const isOpen = openId === faq.id;

						return (
							<div
								key={faq.id}
								onClick={() => toggleAccordion(faq.id)}
								className={cn(
									"group relative flex w-full cursor-pointer flex-col justify-center border-b border-[#292929] transition-colors duration-300 last:border-b-0",
									!isOpen && "hover:bg-[#080808]",
								)}
							>
								<div
									className={cn(
										"absolute inset-0 z-0 overflow-hidden pointer-events-none transition-opacity duration-500",
										isOpen ? "opacity-100" : "opacity-0",
									)}
								>
									<div className="absolute inset-0 bg-white/[0.03] md:group-hover:block hidden" />

									<img
										src="/images/pricing/FAQ/faqbg.svg"
										alt="faq background"
										loading="lazy"
										className="absolute right-0 top-0 w-full h-[400px] md:h-full object-contain object-top-right md:object-cover md:object-right border-none opacity-60"
									/>
									<div className="absolute inset-0 bg-linear-to-r from-[#351B6D]/90 via-[#351B6D]/80 to-black/75 mix-blend-normal" />
								</div>

								<div className="relative z-10 px-4.5 md:px-4 lg:px-[20px] py-[30px]">
									<div className="flex items-center justify-between gap-4">
										<h3
											className={cn(
												"text-base tracking-[-2%] transition-all duration-400 lg:text-[18px]",
												isOpen
													? "font-normal text-white"
													: "font-light text-[#FFFFFF66] md:group-hover:text-white",
											)}
										>
											{faq.question}
										</h3>
										<div className="shrink-0 overflow-hidden">
											<AnimatedPlusMinus
												isOpen={isOpen}
												className={cn(
													"h-5 w-5 transition-colors duration-400",
													isOpen
														? "text-white"
														: "text-[#FFFFFF66] md:group-hover:text-white",
												)}
											/>
										</div>
									</div>

									<div
										className={cn(
											"grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
											isOpen
												? "grid-rows-[1fr] opacity-100"
												: "grid-rows-[0fr] opacity-0",
										)}
									>
										<div className="overflow-hidden">
											<AnimatePresence initial={false}>
												{isOpen && (
													<motion.div
														initial={{ y: -15, opacity: 0 }}
														animate={{ y: 0, opacity: 1 }}
														exit={{ y: -10, opacity: 0 }}
														transition={{
															height: springConfig,
															opacity: { duration: 0.25 },
															y: springConfig,
														}}
														className="pt-5 text-[#ffffff] leading-[16px] md:leading-[20px] font-light text-[12px] md:text-[14px] max-w-[85%] flex flex-col gap-3.5 tracking-[-0.5%]"
													>
														{faq.answer.split("\n\n").map((paragraph, idx) => (
															<p key={idx}>{paragraph}</p>
														))}
													</motion.div>
												)}
											</AnimatePresence>
										</div>
									</div>
								</div>
							</div>
						);
					})}

					<div
						className="relative z-0 px-8 lg:px-[20px] py-[30px] pointer-events-none opacity-0 select-none"
						aria-hidden="true"
					>
						<div className="flex items-center justify-between gap-4">
							<h3 className="text-base lg:text-[18px] tracking-[-2%] text-transparent select-none">
								&nbsp;
							</h3>
							<div className="shrink-0 w-5 h-5"></div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
