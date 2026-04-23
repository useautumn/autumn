"use client";

import { useEffect } from "react";
import FAQ from "./faq";
import Features from "./features";
import Footer from "./footer";
import Hero from "./hero";
import Pricing from "./pricing";
import PricingModels from "./pricing-models";
import Problem from "./problem";
import ProductionScale from "./production-scale";
import SectionDivider from "./section-divider";
import Solution from "./solution";
import Testimonials from "./testimonials";

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
