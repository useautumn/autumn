const PUBLIC_METHODS = new Set([
	"initialize",
	"notifications/initialized",
	"ping",
	"tools/list",
]);

const hasPublicMethod = (value: unknown) =>
	typeof value === "object" &&
	value !== null &&
	"method" in value &&
	typeof value.method === "string" &&
	PUBLIC_METHODS.has(value.method);

export const isPublicMcpDiscoveryRequest = async (request: Request) => {
	if (request.method !== "POST") return false;

	try {
		const body: unknown = await request.clone().json();
		const messages = Array.isArray(body) ? body : [body];
		return messages.length > 0 && messages.every(hasPublicMethod);
	} catch {
		return false;
	}
};
