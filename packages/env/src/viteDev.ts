export type ViteHmrClient = { clientPort: number } | { port: number };

/**
 * Don't pin `host` — the client uses location.hostname so the same Vite
 * process works on wtN.localhost and autumn-wtN.autumnworktree.com.
 */
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
	} catch {
		// missing or invalid — talk to Vite on its listen port
	}
	return { port: vitePort };
}
