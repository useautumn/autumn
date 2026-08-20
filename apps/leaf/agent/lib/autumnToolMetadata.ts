import { type AppEnv, ms } from "@autumn/shared";
import {
	type AutumnMcpToolMetadata,
	listAutumnMcpTools,
} from "../../src/internal/autumnMcp/rpcClient.js";
import { createTtlCache } from "../../src/lib/ttlCache.js";

/** The agent bundle may run inside the eve server process, whose own PORT
 * shadows leaf's — so leaf's MCP address is resolved from the CHAT vars. */
export const leafMcpBaseUrl = () =>
	process.env.CHAT_SERVER_URL ??
	`http://localhost:${process.env.CHAT_PORT ?? 3099}`;

const metadataCache = createTtlCache<AutumnMcpToolMetadata[]>({
	ttlMs: ms.minutes(5),
});

/** The server's tool listing with exact wire schemas, cached per env so a
 * schema deploy surfaces within minutes without a per-step round trip. */
export const serverToolMetadata = ({
	appEnv,
	token,
}: {
	appEnv: AppEnv;
	token: string;
}) =>
	metadataCache.getOrCreate(appEnv, () =>
		listAutumnMcpTools({ baseUrl: leafMcpBaseUrl(), env: appEnv, token }),
	);
