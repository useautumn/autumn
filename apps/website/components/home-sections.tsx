"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import Hero from "./hero";
import SectionDivider from "./section-divider";

// All below-fold sections are code-split into separate lazy chunks so the
// initial JS bundle only contains the hero. Framer-motion, GSAP ScrollTrigger,
// and lottie-web are pulled into these chunks rather than the main bundle.
const LogoWall = dynamic(() => import("./logo-wall"));
const Problem = dynamic(() => import("./problem"));
const Solution = dynamic(() => import("./solution"));
const PricingModels = dynamic(() => import("./pricing-models"));
const Features = dynamic(() => import("./features"));
const Testimonials = dynamic(() => import("./testimonials"));
const ProductionScale = dynamic(() => import("./production-scale"));
const Pricing = dynamic(() => import("./pricing"));
const FAQ = dynamic(() => import("./faq"));
const Footer = dynamic(() => import("./footer"));

function scrollToHash() {
	const hash = window.location.hash;
	if (!hash) return;
	const el = document.querySelector(hash);
	if (!el) return;
	const top = el.getBoundingClientRect().top + window.scrollY - 64;
	window.scrollTo({ top, behavior: "smooth" });
}

export default function HomeSections() {
	useEffect(() => {
		if (!window.location.hash) return;
		const timers = [
			setTimeout(scrollToHash, 100),
			setTimeout(scrollToHash, 500),
			setTimeout(scrollToHash, 1200),
		];
		return () => timers.forEach(clearTimeout);
	}, []);

	return (
		<>
			<Hero />
						{/*
			<div className="flex flex-col gap-2.5 bg-[#000000]">
				<div className="border-t border-[#292929] w-full" />
				<div className="border-t border-[#292929] w-full" />
				<div className="border-t border-[#292929] w-full" />
				<div className="border-t border-[#292929] w-full" />
				<div className="border-t border-[#292929] w-full" />
			</div>
 <LogoWall /> */}
			<SectionDivider title="THE PROBLEM" />
			<Problem />
			<SectionDivider title="THE SOLUTION" />
			<Solution />
			<SectionDivider title="PRICING MODELS" />
			<PricingModels />
			<SectionDivider title="FEATURES" />
			<Features />
			<SectionDivider title="TESTIMONIALS" />
			<Testimonials />
			<SectionDivider title="PRODUCTION SCALE" />
			<ProductionScale />
			<SectionDivider title="PRICING" />
			<Pricing />
			<SectionDivider title="FAQ" />
			<FAQ />
			<Footer />
		</>
	);
}
