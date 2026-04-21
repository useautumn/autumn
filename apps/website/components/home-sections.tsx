"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import Hero from "./hero";
import SectionDivider from "./section-divider";

const ProductionScale = dynamic(
	() => import("@/components/production-scale"),
);
const Problem = dynamic(() => import("@/components/problem"));
const Solution = dynamic(() => import("@/components/solution"));
const Features = dynamic(() => import("@/components/features"));
const PricingModels = dynamic(() => import("@/components/pricing-models"));
const Testimonials = dynamic(() => import("@/components/testimonials"));
const Pricing = dynamic(() => import("@/components/pricing"));
const FAQ = dynamic(() => import("@/components/faq"));
const Footer = dynamic(() => import("@/components/footer"));

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
