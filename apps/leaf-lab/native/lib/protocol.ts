import type { AutumnMcpToolMetadata } from "../../../leaf/src/internal/autumnMcp/rpcClient.js";

export type NativeMode = "jev" | "flash" | "opus";
export type NativeCall = {
	sessionId: string;
	callId: string;
	name: string;
	args: Record<string, unknown>;
};
export type NativeContext = {
	content: string;
	tools: AutumnMcpToolMetadata[];
};

export const nativeBridgeRequest = async <T>(
	path: string,
	body: unknown,
): Promise<T> => {
	const base = process.env.LEAF_NATIVE_BRIDGE_URL;
	const token = process.env.LEAF_NATIVE_BRIDGE_TOKEN;
	if (!base || new URL(base).hostname !== "127.0.0.1" || !token)
		throw new Error(
			"Native evals require an authenticated loopback mock bridge",
		);
	const response = await fetch(new URL(path, base), {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(60_000),
	});
	const value = await response.json();
	if (!response.ok)
		throw new Error(
			(value as { error?: string }).error ?? "Native bridge failed",
		);
	return value as T;
};
