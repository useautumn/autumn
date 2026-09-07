import type { Metadata } from "next";
import CompanyPage from "@/components/company-page";
import { developersContent } from "@/lib/companyContent";

export const metadata: Metadata = {
	title: "Autumn Developer Resources",
	description:
		"Autumn API docs, OpenAPI schema, OAuth metadata, SDKs, CLI, webhooks, and MCP server for developers and agents.",
	alternates: { canonical: "/developers" },
};

export default function DevelopersPage() {
	return <CompanyPage content={developersContent} />;
}
