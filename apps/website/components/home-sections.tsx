"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import Hero from "./hero";
import LazySection from "./lazy-section";
import SectionDivider from "./section-divider";

// All below-fold sections are code-split into separate lazy chunks so the
// initial JS bundle only contains the hero. Framer-motion, GSAP ScrollTrigger,
// and lottie-web are pulled into these chunks rather than the main bundle.
// LazySection gates each component behind an IntersectionObserver so chunks
// and their heavy assets (Lottie JSON, ScrollTrigger) only download as the
// user scrolls toward them rather than all at once on page load.
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

 <LogoWall />
			<SectionDivider title="THE PROBLEM" />
			<LazySection><Problem /></LazySection>
			<SectionDivider title="THE SOLUTION" />
			<LazySection><Solution /></LazySection>
			<SectionDivider title="PRICING MODELS" />
			<LazySection><PricingModels /></LazySection>
			<SectionDivider title="FEATURES" />
			<LazySection><Features /></LazySection>
			<SectionDivider title="TESTIMONIALS" />
			<LazySection><Testimonials /></LazySection>
			<SectionDivider title="PRODUCTION SCALE" />
			<LazySection><ProductionScale /></LazySection>
			<SectionDivider title="PRICING" />
			<LazySection><Pricing /></LazySection>
			<SectionDivider title="FAQ" />
			<LazySection><FAQ /></LazySection>
			<LazySection><Footer /></LazySection>
		</>
	);
}
