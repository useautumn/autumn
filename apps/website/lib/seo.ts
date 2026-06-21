import { faqData } from "@/app/constant";
import type { BlogPostSummary } from "@/lib/blogUtils";

export const SITE_URL = "https://useautumn.com";
const ORG_NAME = "Autumn";
const LOGO_URL = `${SITE_URL}/icon-192.png`;
const SAME_AS = [
	"https://x.com/autumnpricing",
	"https://www.linkedin.com/company/useautumn",
	"https://discord.com/invite/STqxY92zuS",
];

export function absoluteUrl(path: string) {
	return path.startsWith("http") ? path : `${SITE_URL}${path}`;
}

// Strip markdown artifacts so schema text is plain prose for crawlers/LLMs.
function toPlainText(value: string) {
	return value
		.replace(/`/g, "")
		.replace(/\s*\n+\s*/g, " ")
		.trim();
}

export function organizationSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		"@id": `${SITE_URL}/#organization`,
		name: ORG_NAME,
		url: SITE_URL,
		logo: LOGO_URL,
		description:
			"Billing infrastructure for AI startups: usage-based billing, credits, entitlements, and subscription state in one API.",
		sameAs: SAME_AS,
	};
}

export function websiteSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		"@id": `${SITE_URL}/#website`,
		name: ORG_NAME,
		alternateName: "useautumn.com",
		url: SITE_URL,
		publisher: { "@id": `${SITE_URL}/#organization` },
	};
}

export function softwareApplicationSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: ORG_NAME,
		applicationCategory: "BusinessApplication",
		operatingSystem: "Web",
		url: SITE_URL,
		description:
			"The drop-in billing layer for AI startups. Stop rebuilding usage limits, credit systems, and subscription logic.",
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		publisher: { "@id": `${SITE_URL}/#organization` },
	};
}

export function faqPageSchema() {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqData.map((faq) => ({
			"@type": "Question",
			name: faq.question,
			acceptedAnswer: { "@type": "Answer", text: toPlainText(faq.answer) },
		})),
	};
}

export function blogPostingSchema(post: BlogPostSummary) {
	const postUrl = `${SITE_URL}/blog/${post.slug}`;
	return {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		"@id": `${postUrl}/#article`,
		headline: post.title,
		description: toPlainText(post.description),
		url: postUrl,
		mainEntityOfPage: postUrl,
		...(post.image ? { image: absoluteUrl(post.image) } : {}),
		...(post.date ? { datePublished: post.date, dateModified: post.date } : {}),
		author: { "@type": "Organization", name: post.author },
		publisher: { "@id": `${SITE_URL}/#organization` },
	};
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: absoluteUrl(item.path),
		})),
	};
}
