const PROBE_TIMEOUT_MS = 1_000;

/** The boot a peer answers ready from on its public port's /health; null when it is not ready or not reachable. */
export const readyBootOf = async ({
	ctx,
	peer,
}: {
	ctx: { publicPort: number; peer: { fetch?: typeof fetch } };
	peer: string;
}): Promise<string | null> => {
	try {
		const reply = await (ctx.peer.fetch ?? fetch)(
			`http://${peer}:${ctx.publicPort}/health`,
			{ signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
		);
		const health = (await reply.json().catch(() => null)) as {
			bootedAt?: string;
		} | null;
		if (reply.status !== 200) return null;
		return health?.bootedAt ?? "unknown";
	} catch {
		return null;
	}
};
