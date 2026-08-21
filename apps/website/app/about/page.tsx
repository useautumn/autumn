import type { Metadata } from "next";
import CompanyPage from "@/components/company-page";
import { aboutContent } from "@/lib/companyContent";

export const metadata: Metadata = {
	title: "About Autumn Billing",
	description:
		"About Autumn, the open-source billing infrastructure operated by Rebase, Inc.",
	alternates: { canonical: "/about" },
};

export default function AboutPage() {
	return <CompanyPage content={aboutContent} />;
}
