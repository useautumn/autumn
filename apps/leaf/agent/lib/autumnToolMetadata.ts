import { type AppEnv, ms } from "@autumn/shared";
import {
	type AutumnMcpToolMetadata,
	listAutumnMcpTools,
} from "../../src/internal/autumnMcp/rpcClient.js";
import { createTtlCache } from "../../src/lib/ttlCache.js";

export const leafMcpBaseUrl = () =>
	process.env.CHAT_SERVER_URL ??
	`http://localhost:${process.env.CHAT_PORT ?? 3099}`;

const metadataCache = createTtlCache<AutumnMcpToolMetadata[]>({
	ttlMs: ms.minutes(5),
});

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
