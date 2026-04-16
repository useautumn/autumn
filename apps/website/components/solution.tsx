import Image from "next/image";
import React from "react";
import SolutionAnimation from "./solution-animation";

const dbItems = [
	{ text: "SUBSCRIPTION STATE", active: true },
	{ text: "CREDIT BALANCES & ROLLOVERS", active: false },
	{ text: "FEATURE ENTITLEMENTS", active: false },
	{ text: "WEBHOOK HANDLING", active: false },
	{ text: "USAGE RESETS & PRORATION", active: false },
];

const appItems = [
	{ text: "PRODUCT FEATURES", icon: "grid" },
	{ text: "USER INTERFACE", icon: "crossfade" },
	{ text: "BUSINESS LOGIC", icon: "box-grid" },
];

const stripeItems = [
	{ text: "MOVES MONEY", icon: "grid" },
	{ text: "INVOICING", icon: "crossfade" },
	{ text: "CARD PROCESSING", icon: "box-grid" },
];

const iconSrc = {
	grid: "/images/solutions/grid.svg",
	crossfade: "/images/solutions/crossfade.svg",
	"box-grid": "/images/solutions/box-grid.svg",
};

export default function Solution() {
	return (
		<section className="relative w-full bg-[#000000] border-t border-[#292929] overflow-hidden pt-24">
			<div
				className="absolute inset-0 z-0 pointer-events-none"
				style={{
					backgroundImage:
						"linear-gradient(to right, rgba(128,128,128,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.07) 1px, transparent 1px)",
					backgroundSize: "40px 40px",
					maskImage:
						"linear-gradient(to bottom, transparent 0%, black 18%, black 78%, transparent 100%)",
					WebkitMaskImage:
						"linear-gradient(to bottom, transparent 0%, black 18%, black 78%, transparent 100%)",
				}}
			/>

			<div className="relative z-10 max-w-[1400px] mx-auto px-4 flex flex-col items-center">
				{/* Heading */}
				<div className="text-center mb-16 lg:mb-4 flex flex-col items-center">
					<h2 className="text-[30px] leading-[30px] md:text-[40px] md:leading-[40px] font-normal tracking-tight mb-6">
						<span className="text-[#A3A3A3]">Replace it all with </span>
						<span className="text-white">Autumn</span>
					</h2>
					<p className="text-[#A3A3A3] text-[14px] md:text-[16px] sm:text-base max-w-2xl mx-auto font-light leading-[20px] tracking-[-2%]">
						Autumn is a database purpose-built for billing state. Configure your
						pricing
						<br className="hidden sm:block" />
						in the dashboard.{" "}
						<span className="text-white">
							Three API calls handle everything else.
						</span>
					</p>
				</div>
				<SolutionAnimation />
			</div>
		</section>
	);
}
