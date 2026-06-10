import { MCP_CLIENT_KIND } from "@autumn/auth/oauth";
import type { Context } from "hono";
import { type DrizzleCli, db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { oauthClientRepo } from "../repos/index.js";

const INTERNAL_MCP_CLIENT_ID = process.env.INTERNAL_MCP_OAUTH_CLIENT_ID;
const INTERNAL_MCP_CLIENT_NAME = "Autumn internal-mcp";
const INTERNAL_MCP_CLIENT_NAME_NORMALIZED =
	INTERNAL_MCP_CLIENT_NAME.toLowerCase();
const INTERNAL_MCP_KIND = "internal_mcp";

type InternalMcpMetadata = {
	kind?: string;
	mcpClientType?: string;
	redirectNames?: Record<string, string>;
};

const parseMetadata = (metadata: unknown): InternalMcpMetadata => {
	if (!metadata) return {};
	if (typeof metadata === "string") {
		try {
			const parsed = JSON.parse(metadata);
			return parsed && typeof parsed === "object" ? parsed : {};
		} catch {
			return {};
		}
	}

	return typeof metadata === "object" ? metadata : {};
};

const inferClientNameFromRedirectUri = (redirectUri: string) => {
	const normalized = redirectUri.toLowerCase();
	if (normalized.includes("cursor")) return "Cursor";
	if (normalized.includes("claude")) return "Claude";
	if (normalized.includes("opencode")) return "OpenCode";
	if (normalized.includes("open-code")) return "OpenCode";
	if (normalized.includes("slack")) return "Slack";
	if (normalized.includes("codex")) return "Codex";
	return "MCP client";
};

export const isInternalMcpOAuthClientRecord = ({
	clientId,
	name,
	metadata,
}: {
	clientId: string | null | undefined;
	name: string | null | undefined;
	metadata?: unknown;
}) => {
	if (INTERNAL_MCP_CLIENT_ID && clientId === INTERNAL_MCP_CLIENT_ID)
		return true;
	if (name?.trim().toLowerCase() === INTERNAL_MCP_CLIENT_NAME_NORMALIZED) {
		return true;
	}
	const parsedMetadata = parseMetadata(metadata);
	return [INTERNAL_MCP_KIND, MCP_CLIENT_KIND].includes(
		parsedMetadata.kind ?? "",
	);
};

export const getInternalMcpDisplayName = ({
	metadata,
	redirectUri,
}: {
	metadata: unknown;
	redirectUri: string | null | undefined;
}) => {
	if (!redirectUri) return null;
	const metadataObject = parseMetadata(metadata);
	return (
		metadataObject.redirectNames?.[redirectUri] ??
		inferClientNameFromRedirectUri(redirectUri)
	);
};

export const isInternalMcpOAuthClientId = async ({
	db,
	clientId,
}: {
	db: DrizzleCli;
	clientId: string;
}) => {
	const client = await oauthClientRepo.getByClientId({ db, clientId });

	return isInternalMcpOAuthClientRecord(client ?? { clientId, name: null });
};

export const handleInternalMcpOAuthAuthorize = async (c: Context) => {
	const url = new URL(c.req.raw.url);
	const clientId = url.searchParams.get("client_id");
	if (!clientId || !(await isInternalMcpOAuthClientId({ db, clientId }))) {
		return auth.handler(c.req.raw);
	}

	const prompts = new Set(url.searchParams.get("prompt")?.split(" ") ?? []);
	prompts.add("consent");
	url.searchParams.set("prompt", [...prompts].filter(Boolean).join(" "));

	return auth.handler(new Request(url, c.req.raw));
};
