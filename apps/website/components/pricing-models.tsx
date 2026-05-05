"use client";

import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { CTALines, IconCTAStart } from "@/app/constant";
import { cn } from "@/lib/utils";

const sidebarItems = [
	{
		id: "subscriptions",
		label: "Subscriptions",
		model: 0,
		desc: "Monthly or yearly plans with feature gating. Upgrades and downgrades handled automatically. Proration included.",
	},
	{
		id: "free-trials",
		label: "Free Trials",
		model: 2,
		desc: "Card-required or card-optional trials. Auto-convert to paid. Configurable trial lengths per plan.",
	},
	{
		id: "credits",
		label: "Credits & Top-ups",
		model: 1,
		desc: "Prepaid credits that features draw from. One-time purchases or auto-refill. Set minimum thresholds.",
	},
	{
		id: "usage",
		label: "Usage-Based",
		model: 4,
		desc: "Pay for what you use. Real-time metering, overage handling, usage resets. Combine with base\u00a0subscriptions.",
	},
	{
		id: "seat",
		label: "Seat-Based",
		model: 6,
		desc: "Per-user pricing with seat limits. Add or remove seats dynamically. Automatic proration.",
	},
	{
		id: "hybrid",
		label: "Hybrid Models",
		model: 5,
		desc: "Mix subscriptions, usage, credits, and seats in one plan. Example: $50/month + $0.02/token + 5 seats included.",
	},
	{
		id: "rollovers",
		label: "Rollovers & Expirations",
		model: 7,
		desc: "Roll credits to next period or expire after X days. Configure per plan or per feature.",
	},
	{
		id: "enterprise",
		label: "Custom Enterprise",
		model: 3,
		desc: "One-off pricing for large customers. Unique limits, custom billing cycles, manual overrides—all in the dashboard.",
	},
] as const;

const images: Record<(typeof sidebarItems)[number]["model"], string> = {
	0: "/images/pricing-models/Subscriptions.avif",
	1: "/images/pricing-models/Subscriptions (1).avif",
	2: "/images/pricing-models/Trial Configuration.avif",
	3: "/images/pricing-models/Hybrid Plan Builder.avif",
	4: "/images/pricing-models/Usage Metering.avif",
	5: "/images/pricing-models/Hybrid Plan Builder (1).avif",
	6: "/images/pricing-models/Subscriptions (2).avif",
	7: "/images/pricing-models/Subscriptions (3).avif",
};

const mobileImages: Record<(typeof sidebarItems)[number]["model"], string> = {
	0: "/images/pricing-models/Subscriptions-mobile.avif",
	1: "/images/pricing-models/Subscriptions (1)-mobile.avif",
	2: "/images/pricing-models/Trial Configuration-mobile.avif",
	3: "/images/pricing-models/Hybrid Plan Builder-mobile.avif",
	4: "/images/pricing-models/Usage Metering-mobile.avif",
	5: "/images/pricing-models/Hybrid Plan Builder (1)-mobile.avif",
	6: "/images/pricing-models/Subscriptions (2)-mobile.avif",
	7: "/images/pricing-models/Subscriptions (3)-mobile.avif",
};

export default function PricingModels() {
	const [activeTab, setActiveTab] = useState<(typeof sidebarItems)[number]>(
		sidebarItems[0],
	);

	return (
		<section className="bg-[#000000] w-full overflow-hidden flex flex-col">
			<div className="hidden lg:flex w-full items-center justify-between py-12 xl:py-24 relative z-10 px-4 xl:px-22.75">
				<div className="flex w-full">
					<div className="">
						<h2 className="text-[40px] leading-[1.1] font-sans tracking-[-2%] font-normal">
							<span className="text-[#FFFFFF99]">Any pricing model.</span>{" "}
							<span className="text-white">Seriously.</span>
						</h2>
						<div className="mt-4 text-[16px] font-sans leading-relaxed tracking-[-1%] font-light">
							<span className="text-[#FFFFFF99]">
								Configure in the dashboard or CLI.
							</span>{" "}
							<span className="text-[#FFFFFF99]">
								Rollout to all customers, or create custom plans for your
								largest customers.
							</span>
						</div>
					</div>
				</div>
				<div className="hero-cta">
					<Link
						href={"https://docs.useautumn.com/examples/monetary-credits"}
						target="_blank"
					>
						<motion.div
							initial="initial"
							whileHover="hover"
							whileTap="tap"
							className="relative"
						>
							<div className="relative overflow-hidden flex items-center cursor-pointer justify-between px-4 py-3.5 md:w-50 font-sans bg-[#9564ff] hover:bg-[#7D46F4] active:bg-[#7D46F4] transition-colors duration-300 whitespace-nowrap">
								<CTALines />
								<span className="relative z-10 tracking-tight text-white font-medium">
									View templates
								</span>
								<span className="relative z-10">
									<IconCTAStart />
								</span>
							</div>
						</motion.div>
					</Link>
				</div>
			</div>

			<div className="flex lg:hidden flex-col px-4 py-12 relative z-10">
				<h2 className="text-[28px] sm:text-[32px] leading-[1.1] font-sans tracking-[-2%] font-normal">
					<span className="text-[#FFFFFF99]">Any pricing model.</span>{" "}
					<span className="text-white">Seriously.</span>
				</h2>
				<div className="mt-4 text-[15px] font-sans leading-relaxed tracking-[-1%] font-light">
					<span className="text-[#FFFFFF99]">
						Configure in the dashboard or CLI.
					</span>{" "}
					<span className="text-[#FFFFFF99]">
						Rollout to all customers, or create custom plans for your largest
						customers.
					</span>
				</div>
			</div>

			<div className="border-t-0 lg:border-t border-[#292929] w-full relative grid grid-cols-1 lg:grid-cols-[60px_220px_220px_1fr] xl:grid-cols-[90px_291px_300px_1fr] auto-rows-auto lg:grid-rows-[200px_260px] xl:grid-rows-[260px_340px]">
				<div className="hidden lg:block border-l border-r border-b border-[#292929] min-h-[120px] lg:min-h-[260px]"></div>
				<div className="hidden lg:block border-r border-b border-[#292929]"></div>
				<div className="hidden z-20 lg:block border-r border-b bg-[#0F0F0F] border-[#292929]"></div>
				<div className="hidden lg:flex lg:row-span-2 items-end justify-center lg:pl-4 lg:pr-4 relative z-10 w-full lg:h-full order-first lg:order-0 mt-0 xl:mt-10.5">
					<div className="relative z-10 w-full lg:max-w-120 xl:max-w-150 h-auto overflow-hidden">
						<div className="relative w-full aspect-square">
							{Object.entries(images).map(([key, src]) => {
								const isActive = activeTab.model === Number(key);
								return (
									<motion.div
										key={key}
										initial={false}
										animate={{
											opacity: isActive ? 1 : 0,
											scale: isActive ? 1 : 0.98,
										}}
										transition={{ duration: 0.25 }}
										className="absolute inset-0"
									>
										<Image
											src={src}
											alt="Pricing Model"
											fill
											sizes="(max-width: 1024px) 100vw, (max-width: 1440px) 40vw, 600px"
											className="object-contain"
											priority={key === "0"}
										/>
									</motion.div>
								);
							})}
						</div>
					</div>
				</div>
				<div className="hidden lg:block border-l border-r border-[#292929]"></div>
				<div className="relative z-10 flex flex-col border-r border-[#292929] bg-[#000000] py-0 lg:py-[32px]">
					<ul className="flex flex-col">
						{sidebarItems.map((item) => {
							const isActive = activeTab.id === item.id;
							return (
								<li
									key={item.id}
									onClick={() => setActiveTab(item)}
									className={cn(
										"flex cursor-pointer flex-col border-b border-[#292929] transition-colors last:border-b-0 lg:border-none",
										isActive && "bg-[#0f0f0f] lg:bg-transparent",
									)}
								>
									{/* Mobile Accordion Image */}
									<AnimatePresence>
										{isActive && (
											<motion.div
												initial={{ height: 0, opacity: 0 }}
												animate={{ height: "auto", opacity: 1 }}
												exit={{ height: 0, opacity: 0 }}
												className="block lg:hidden w-full relative overflow-hidden"
											>
												<div className="relative w-full aspect-3/2.5 sm:aspect-square">
													<div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center px-3 pt-2">
														<Image
															src={mobileImages[item.model]}
															alt="Pricing Model"
															width={1212}
															height={1048}
															sizes="(max-width: 640px) 90vw, (max-width: 768px) 85vw, 400px"
															className="w-full h-auto max-h-full object-contain object-bottom"
														/>
													</div>
												</div>
											</motion.div>
										)}
									</AnimatePresence>

									<div
										className={cn(
											"flex items-center gap-2 px-4 py-5 font-sans text-[20px] leading-none tracking-[-5%] lg:px-[14px] lg:py-1.5 lg:text-[20px] lg:leading-[20px]",
											isActive
												? "text-white lg:text-[#FFFFFF99]"
												: "text-[#FFFFFF99] lg:text-[#FFFFFF99] lg:opacity-50",
										)}
									>
										<div className="w-[3px] h-[24px] hidden lg:block">
											{isActive && (
												<motion.div
													layoutId="activeTabIndicator"
													className="w-[3px] h-[24px] bg-[#9564FF]"
												/>
											)}
										</div>
										{item.label}
									</div>

									{/* Mobile Accordion Description */}
									<AnimatePresence>
										{isActive && (
											<motion.div
												initial={{ height: 0, opacity: 0 }}
												animate={{ height: "auto", opacity: 1 }}
												exit={{ height: 0, opacity: 0 }}
												className="lg:hidden px-4 border-b border-[#8752FA] overflow-hidden text-[#FFFFFF99] text-[14px] md:text-[16px] lg:text-[14px] leading-[1.4] tracking-[-2%] font-light text-pretty"
											>
												<div className="pb-6">{item.desc}</div>
											</motion.div>
										)}
									</AnimatePresence>
								</li>
							);
						})}
					</ul>
				</div>
				<div className="hidden lg:flex border-b border-r lg:border-b-0 bg-[#0F0F0F] border-[#292929] flex-col justify-end p-6 z-10 relative">
					<div className="text-[#FFFFFF99] text-[16px] font-sans leading-relaxed tracking-[-2%] font-light text-pretty">
						<AnimatePresence mode="wait">
							<motion.div
								key={activeTab.id}
								initial={{ opacity: 0, y: 5 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -5 }}
								transition={{ duration: 0.2 }}
							>
								{activeTab.desc}
							</motion.div>
						</AnimatePresence>
					</div>
				</div>
			</div>
		</section>
	);
}
