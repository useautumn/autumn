export const dynamic = "force-static";

const OPENAPI_URL =
	"https://raw.githubusercontent.com/useautumn/autumn/refs/heads/dev/packages/openapi/openapi.yml";
const DOCS_URL = "https://docs.useautumn.com";
const API_BASE = "https://api.useautumn.com";

export function GET() {
	const body = {
		linkset: [
			{
				anchor: API_BASE,
				"service-desc": [
					{
						href: OPENAPI_URL,
						type: "application/yaml",
					},
				],
				"service-doc": [
					{
						href: DOCS_URL,
						type: "text/html",
					},
				],
			},
		],
	};

	return new Response(JSON.stringify(body, null, 2), {
		status: 200,
		headers: {
			"Content-Type": "application/linkset+json",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
