type JsonLdProps = {
	data: Record<string, unknown> | Array<Record<string, unknown>>;
};

// Server-rendered structured data so crawlers and LLMs read it without executing JS.
export default function JsonLd({ data }: JsonLdProps) {
	return (
		<script
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: serialized schema.org JSON, not user input
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
		/>
	);
}
