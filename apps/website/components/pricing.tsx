"use client";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { IconArrowRightSmall, IconTick } from "@/app/constant";

const plans = [
	{
		name: "FREE",
		price: "0",
		description: "Perfect while finding PMF. Everything you need to start.",
		features: [
			"Up to 8K monthly revenue",
			"All core features",
			"Community support",
		],
		buttonText: "Get started",
		href: "https://app.useautumn.com/sign-in",
		isPro: false,
	},
	{
		name: "PRO",
		price: "375",
		description: "For teams scaling with real usage-based pricing.",
		features: [
			"Up to 50K monthly revenue",
			"Priority support",
			"Custom plans",
			"Usage analytics",
		],
		buttonText: "Start with Pro",
		href: "https://app.useautumn.com/sign-in",
		isPro: true,
	},
	{
		name: "ENTERPRISE",
		price: "Custom",
		description: "For compliance, scale, or custom requirements.",
		features: ["Dedicated support", "Multi-region", "Compliance assistance"],
		buttonText: "Book a call",
		href: "https://cal.com/ayrod/a?user=ayrod",
		isPro: false,
	},
];

export default function Pricing() {
	return (
		<>
			<div
				id="pricing"
				className="min-h-screen relative flex w-full lg:w-[calc(100%+calc(var(--page-pad)*2))] lg:-ml-(--page-pad) items-center justify-center lg:py-24 pb-3"
			>
				{/* Desktop Background */}
				<Image
					src="/images/pricing/pricing.webp"
					alt="pricing background desktop"
					fill
					className="object-cover absolute z-10 lg:z-50 hidden md:block"
					loading="lazy"
				/>
				{/* Mobile Background */}
				<Image
					src="/images/pricing/pricing-mob.webp"
					alt="pricing background mobile"
					fill
					className="object-cover absolute z-10 lg:z-50 block md:hidden"
					loading="lazy"
				/>
				<div className="relative z-20 lg:z-60 w-full pt-0 lg:pt-8 pl-4 lg:pl-[calc(var(--page-pad)+22px)] xl:pl-[calc(var(--page-pad)+90px)] pr-4 lg:pr-[calc(var(--page-pad)+22px)] xl:pr-[calc(var(--page-pad)+90px)]">
					<div className="lg:bg-black text-white lg:border lg:border-[#292929] flex flex-col gap-6 lg:gap-0 border-none">
						{/* Header */}
						<div className="bg-black lg:bg-transparent -mx-4 px-4 lg:mx-0 lg:px-8 py-10 lg:py-8 border-b-0 lg:border-b border-[#292929]">
							<h1 className="text-[30px] leading-[32px] md:leading-[40px] md:text-3xl lg:text-[40px] tracking-[-4%] text-white font-normal w-[85%] md:w-full font-sans">
								Start free. Scale with confidence.
							</h1>
						</div>

						{/* Pricing Columns */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 relative z-60 gap-8 lg:gap-0">
							{plans.map((plan, index) => (
								<div
									key={plan.name}
									className={`relative flex flex-col bg-black lg:bg-transparent border lg:border-0 border-[#292929] ${
										index === 0 ? "lg:border-r" : ""
									} ${
										index === 1 ? "lg:border-r" : ""
									} ${index === 2 ? "md:col-span-2 lg:col-span-1 md:w-[calc(50%-16px)] md:justify-self-center lg:w-full lg:justify-self-auto" : ""}`}
								>
									{plan.isPro && (
										<div className="hidden lg:block absolute -inset-px z-20 pointer-events-none border border-transparent [border-image:linear-gradient(to_bottom,#A175FF,#000000)_1]"></div>
									)}

									{plan.isPro && (
										<div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 bg-black text-[14px] font-mono tracking-[-1%] text-white px-3 py-1.5 md:p-2.5 border border-[#A175FF]">
											RECOMMENDED
										</div>
									)}

									<div
										className={
											"flex flex-col h-full px-4 md:px-5 lg:px-8 pt-10 md:pt-10 lg:pt-15 pb-6 md:pb-0 relative z-10 w-full overflow-hidden"
										}
									>
										<div className="mb-6">
											<span className="inline-block px-3 py-1 bg-[#8752FA]/20 text-[#9564FF] text-[12px] md:text-[13px] lg:text-[16px] font-mono tracking-[-2%] uppercase mb-3 md:mb-2">
												{plan.name}
											</span>
											<div className="flex items-start gap-1 mb-2">
												{plan.price !== "Custom" && (
													<span className="text-sm md:text-base lg:text-xl text-white mt-1.5 md:mt-0">
														$
													</span>
												)}
												<span className="text-[30px] md:text-[40px] leading-[44px] lg:text-5xl text-white font-normal tracking-[-2%] font-sans">
													{plan.price}
												</span>
												{plan.price !== "Custom" && (
													<span className="text-[#FFFFFF99] font-light self-end text-[13px] md:text-sm lg:text-base tracking-[-2%] mb-1.5 md:mb-0">
														/month
													</span>
												)}
											</div>
											<p className="md:text-white font-light md:font-extralight text-[13px] md:text-[16px] tracking-[-2%] leading-[18px] md:leading-5 w-full md:w-[95%] text-pretty">
												{plan.description}
											</p>
										</div>

										<div className="border-t border-[#27272A] w-full mb-6"></div>

										<ul className="flex flex-col gap-3 md:gap-4 grow mb-10 md:mb-16.5">
											{plan.features.map((feature, i) => (
												<li key={i} className="flex items-start gap-3">
													<IconTick className="w-4 h-4 mt-[3px] shrink-0" />
													<span className="md:text-white font-light text-[14px] md:text-[16px]">
														{feature}
													</span>
												</li>
											))}
										</ul>

										<div className="flex w-full mb-0 md:mb-8 mt-auto mx-auto pt-4 md:pt-0">
											<motion.div
												initial="initial"
												whileHover="hover"
												whileTap="hover"
												className="w-full"
											>
												<Link
													href={plan.href || "#"}
													target="_blank"
													className="group cursor-pointer w-full flex items-center md:items-stretch justify-between transition-colors duration-300 border bg-transparent py-1 md:py-0 hover:bg-[#7641E8] active:bg-[#7641E8] border-[#292929]"
												>
													<span className="text-white text-[16px] md:text-[18px] pl-4 flex items-center tracking-[-1%] font-sans">
														{plan.buttonText}
													</span>
													<div className="flex items-center justify-center w-8 h-8 md:h-auto md:w-[26px] aspect-square transition-colors duration-300 m-1.5 md:m-2.5 bg-[#514D5A] text-white group-hover:bg-white group-hover:text-[#8752FA] group-active:bg-white group-active:text-[#8752FA]">
														<IconArrowRightSmall className="w-4 h-4" />
													</div>
												</Link>
											</motion.div>
										</div>
									</div>
								</div>
							))}
						</div>

						<div className="px-6 md:px-8 py-5 md:py-6 lg:mt-[32px] border border-[#292929] lg:border-x-0 lg:border-b-0 text-left md:text-center bg-black lg:bg-transparent">
							<p className="text-white text-pretty font-light leading-[18px] tracking-[-2%] md:font-extralight text-[16px] md:leading-[1.6] text-wrap-balance">
								Autumn is built on top of Stripe billing, so Stripe fees (0.7%
								and 2.9% + 30¢) still apply.
							</p>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
