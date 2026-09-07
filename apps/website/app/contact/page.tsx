import type { Metadata } from "next";
import CompanyPage from "@/components/company-page";
import { contactContent } from "@/lib/companyContent";

export const metadata: Metadata = {
	title: "Contact Autumn",
	description:
		"Official product, support, security, and privacy contact paths for Autumn and Rebase, Inc.",
	alternates: { canonical: "/contact" },
};

export default function ContactPage() {
	return <CompanyPage content={contactContent} />;
}
