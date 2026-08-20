"use client";

import dynamic from "next/dynamic";
import LazySection from "./lazy-section";
import Pricing from "./pricing";
import SectionDivider from "./section-divider";

const FAQ = dynamic(() => import("./faq"));
const Footer = dynamic(() => import("./footer"));

export default function PricingSections() {
	return (
		<>
			<SectionDivider title="PRICING" />
			<Pricing />
			<SectionDivider title="FAQ" />
			<LazySection>
				<FAQ />
			</LazySection>
			<LazySection>
				<Footer />
			</LazySection>
		</>
	);
}
