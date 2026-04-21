"use client";

import dynamic from "next/dynamic";
import Hero from "./hero";
import SectionDivider from "./section-divider";

const ProductionScale = dynamic(() => import("@/components/production-scale"), {
	ssr: false,
});
const Problem = dynamic(() => import("@/components/problem"), { ssr: false });
const Solution = dynamic(() => import("@/components/solution"), { ssr: false });
const Features = dynamic(() => import("@/components/features"), { ssr: false });
const PricingModels = dynamic(() => import("@/components/pricing-models"), {
	ssr: false,
});
const Testimonials = dynamic(() => import("@/components/testimonials"), {
	ssr: false,
});
const Pricing = dynamic(() => import("@/components/pricing"), { ssr: false });
const FAQ = dynamic(() => import("@/components/faq"), { ssr: false });
const Footer = dynamic(() => import("@/components/footer"), { ssr: false });

export default function HomeSections() {
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
