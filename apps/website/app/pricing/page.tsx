import type { Metadata } from "next";
import ElasticRecoil from "@/components/elastic-footer";
import JsonLd from "@/components/json-ld";
import Navbar from "@/components/navbar";
import PricingSections from "@/components/pricing-sections";
import { faqPageSchema, organizationSchema, websiteSchema } from "@/lib/seo";
import type { PageStyle } from "@/lib/types";

export const metadata: Metadata = {
	title: "Pricing",
	description:
		"Autumn pricing. Start free with 8K monthly billing volume, scale to Pro from $375/month, or talk to us about volume discounts.",
	alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
	return (
		<div
			className="w-full overflow-x-clip"
			style={
				{ "--page-pad": "max(2.5rem, calc((100vw - 1440px) / 2))" } as PageStyle
			}
		>
			<JsonLd data={[organizationSchema(), websiteSchema(), faqPageSchema()]} />
			<ElasticRecoil>
				<div className="relative z-10 bg-[#000000] min-h-screen">
					<div className="relative w-full px-4 md:px-(--page-pad) pt-5">
						<div className="absolute pointer-events-none top-0 bottom-0 left-4 md:left-(--page-pad) border-l border-[#292929] z-50" />
						<Navbar />
						<div className="absolute pointer-events-none top-0 bottom-0 right-4 md:right-(--page-pad) border-r border-[#292929] z-50" />

						<PricingSections />

						<div className="w-full flex-col gap-2.5 mt-10.5 hidden md:flex">
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full" />
							<div className="border-t border-[#292929] w-full" />
						</div>
					</div>
				</div>
			</ElasticRecoil>
		</div>
	);
}
