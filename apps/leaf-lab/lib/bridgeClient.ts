export const bridgeRequest = async <T>(
	path: string,
	body?: unknown,
): Promise<T> => {
	const base = process.env.LEAF_LAB_BRIDGE_URL;
	if (!base || new URL(base).hostname !== "127.0.0.1") {
		throw new Error("Leaf lab requires its loopback fixture bridge");
	}
	const response = await fetch(new URL(path, base), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${process.env.LEAF_LAB_BRIDGE_TOKEN}`,
		},
		body: JSON.stringify(body ?? {}),
		signal: AbortSignal.timeout(60_000),
	});
	const value = await response.json();
	if (!response.ok)
		throw new Error(
			(value as { error?: string }).error ?? "Fixture bridge failed",
		);
	return value as T;
};
