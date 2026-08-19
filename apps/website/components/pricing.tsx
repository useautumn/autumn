"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { IconArrowRightSmall, IconTick } from "@/app/constant";
import { cn } from "@/lib/utils";
import VolumeSlider, {
	defaultVolumeTierIndex,
	type VolumeTier,
	volumeTiers,
} from "./pricing-volume-slider";

type PlanFeature = { label: string; note?: string };

type Plan = {
	name: string;
	price: string | null;
	description: string;
	features: PlanFeature[];
	buttonText: string;
	href: string;
	tracksBillingVolume?: boolean;
};

function planFeatures(plan: Plan, tier: VolumeTier): PlanFeature[] {
	if (!plan.tracksBillingVolume) return plan.features;
	return [
		{ label: `${tier.proVolume} monthly billing volume` },
		...plan.features,
	];
}

const plans: Plan[] = [
	{
		name: "FREE",
		price: "0",
		description: "Perfect while finding PMF. Everything you need to start.",
		features: [
			{ label: "8K monthly billing volume" },
			{ label: "10,000 customers and entities" },
			{ label: "10M API requests included" },
			{ label: "CLI and MCP" },
			{ label: "Community support" },
		],
		buttonText: "Get started",
		href: "https://app.useautumn.com/sign-in",
	},
	{
		name: "PRO",
		price: null,
		description: "For teams scaling with real usage-based pricing.",
		features: [
			{ label: "20M API requests included", note: "then $5 per 1M requests" },
			{ label: "Unlimited customers and entities" },
			{ label: "Usage event aggregation" },
			{ label: "Data warehouse integration" },
			{
				label: "Multiple billing sources",
				note: "Stripe, RevenueCat, Vercel",
			},
			{ label: "Dedicated Slack support" },
		],
		buttonText: "Start with Pro",
		href: "https://app.useautumn.com/sign-in",
		tracksBillingVolume: true,
	},
	{
		name: "SCALE",
		price: "Custom",
		description: "For high throughput, compliance, or custom requirements.",
		features: [
			{ label: "Everything in Pro" },
			{ label: "Unlimited billing volume" },
			{ label: "Event volume discount" },
			{ label: "End-to-end implementation" },
			{ label: "Dedicated cache infrastructure" },
		],
		buttonText: "Contact us",
		href: "https://cal.com/ayrod/a?user=ayrod",
	},
];

export default function Pricing() {
	const [tierIndex, setTierIndex] = useState(defaultVolumeTierIndex);
	const tier = volumeTiers[tierIndex];

	return (
		<>
			<section id="pricing" className="bg-[#000000] w-full scroll-mt-16">
				<div className="flex flex-col px-4 sm:px-8 py-12 md:py-16 xl:px-22.75">
					<div className="text-white flex flex-col gap-6 lg:gap-0">
						{/* Header */}
						<div className="px-4 lg:px-8 pt-10 lg:pt-8 pb-16 lg:pb-18">
							<h1 className="text-[30px] leading-[32px] md:leading-[40px] md:text-3xl lg:text-[40px] tracking-[-4%] text-white font-normal w-full text-center font-sans">
								Start free. Scale with confidence.
							</h1>

							<div className="mt-8 lg:mt-10 w-full lg:max-w-[640px] mx-auto px-6 lg:px-0">
								<VolumeSlider tierIndex={tierIndex} onChange={setTierIndex} />
							</div>
						</div>

						{/* Pricing Columns */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 relative z-60 gap-8 lg:gap-0">
							{plans.map((plan, index) => {
								const isHighlighted = plan.name === tier.plan;
								const price = plan.price ?? tier.proPrice;
								const opensExternally = !plan.href.startsWith(
									"https://app.useautumn.com",
								);

								return (
									<div
										key={plan.name}
										className={cn(
											"relative flex flex-col border lg:border-0 transition-colors duration-300",
											isHighlighted ? "border-[#A175FF]" : "border-[#292929]",
											index === 2 &&
												"md:col-span-2 lg:col-span-1 md:w-[calc(50%-16px)] md:justify-self-center lg:w-full lg:justify-self-auto",
										)}
									>
										{isHighlighted && (
											<div className="hidden lg:block absolute -inset-px z-20 pointer-events-none border border-transparent [border-image:linear-gradient(to_bottom,#A175FF,#000000)_1]"></div>
										)}

										{isHighlighted && (
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
													{price !== "Custom" && (
														<span className="text-sm md:text-base lg:text-xl text-white mt-1.5 md:mt-0">
															$
														</span>
													)}
													<span className="text-[30px] md:text-[40px] leading-[44px] lg:text-5xl text-white font-normal tracking-[-2%] font-sans">
														{price}
													</span>
													{price !== "Custom" && (
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
												{planFeatures(plan, tier).map((feature) => (
													<li
														key={feature.label}
														className="flex items-start gap-3"
													>
														<IconTick className="w-4 h-4 mt-[3px] shrink-0" />
														<span className="md:text-white font-light text-[14px] md:text-[16px]">
															{feature.label}
															{feature.note && (
																<span className="block text-[#FFFFFF99] font-light text-[13px] md:text-[15px]">
																	{feature.note}
																</span>
															)}
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
														href={plan.href}
														target={opensExternally ? "_blank" : undefined}
														rel={opensExternally ? "noopener" : undefined}
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
								);
							})}
						</div>

						<div className="px-6 md:px-8 py-5 md:py-6 lg:mt-[32px] text-left md:text-center">
							<p className="text-white text-pretty font-light leading-[18px] tracking-[-2%] md:font-extralight text-[16px] md:leading-[1.6] text-wrap-balance">
								Autumn is built on top of Stripe billing, so Stripe fees (0.7%
								and 2.9% + 30¢) still apply.
							</p>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
