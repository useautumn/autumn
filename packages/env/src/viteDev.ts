export type ViteHmrClient = { clientPort: number } | { port: number };

export function viteHmrClient({
	frontendUrl,
	vitePort,
}: {
	frontendUrl: string;
	vitePort: number;
}): ViteHmrClient {
	try {
		const url = new URL(frontendUrl);
		if (url.protocol === "https:") {
			return { clientPort: url.port ? Number(url.port) : 443 };
		}
		if (url.port) {
			return { clientPort: Number(url.port) };
		}
	} catch {}
	return { port: vitePort };
}
