import { faqData } from "@/app/constant";

const SITE_URL = "https://useautumn.com";
const ORG_NAME = "Autumn";
const ORG_LOGO = `${SITE_URL}/images/og-image.png`;
const SAME_AS = [
	"https://github.com/useautumn",
	"https://x.com/autumnpricing",
	"https://linkedin.com/company/useautumn",
];

function JsonLd({ data }: { data: unknown }) {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires raw text
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
		/>
	);
}

export function OrganizationJsonLd() {
	return (
		<JsonLd
			data={{
				"@context": "https://schema.org",
				"@type": "Organization",
				name: ORG_NAME,
				url: SITE_URL,
				logo: ORG_LOGO,
				sameAs: SAME_AS,
			}}
		/>
	);
}

export function WebSiteJsonLd() {
	return (
		<JsonLd
			data={{
				"@context": "https://schema.org",
				"@type": "WebSite",
				name: ORG_NAME,
				url: SITE_URL,
				publisher: {
					"@type": "Organization",
					name: ORG_NAME,
				},
			}}
		/>
	);
}

export function FAQPageJsonLd() {
	return (
		<JsonLd
			data={{
				"@context": "https://schema.org",
				"@type": "FAQPage",
				mainEntity: faqData.map((f) => ({
					"@type": "Question",
					name: f.question,
					acceptedAnswer: {
						"@type": "Answer",
						text: f.answer,
					},
				})),
			}}
		/>
	);
}

export function BlogPostingJsonLd({
	post,
}: {
	post: {
		slug: string;
		title: string;
		description: string;
		date: string | null;
		author: string;
		image: string | null;
	};
}) {
	const data: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		headline: post.title,
		description: post.description,
		author: {
			"@type": "Person",
			name: post.author,
		},
		image: post.image
			? `${SITE_URL}${post.image}`
			: `${SITE_URL}/images/og-image.png`,
		publisher: {
			"@type": "Organization",
			name: ORG_NAME,
			logo: {
				"@type": "ImageObject",
				url: ORG_LOGO,
			},
		},
		mainEntityOfPage: {
			"@type": "WebPage",
			"@id": `${SITE_URL}/blog/${post.slug}`,
		},
	};

	if (post.date) {
		data.datePublished = post.date;
	}

	return <JsonLd data={data} />;
}

export function BreadcrumbJsonLd({
	items,
}: {
	items: { name: string; url: string }[];
}) {
	return (
		<JsonLd
			data={{
				"@context": "https://schema.org",
				"@type": "BreadcrumbList",
				itemListElement: items.map((it, i) => ({
					"@type": "ListItem",
					position: i + 1,
					name: it.name,
					item: it.url,
				})),
			}}
		/>
	);
}
