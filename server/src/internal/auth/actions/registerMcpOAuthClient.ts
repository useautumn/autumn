import {
	getLeafMcpOAuthScopes,
	MCP_CLIENT_KIND,
	MCP_OAUTH_CLIENTS,
	type MpcClientInfo,
	type MpcClientType,
} from "@autumn/auth/oauth";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { generateId } from "@/utils/genUtils.js";
import { type OAuthClientRecord, oauthClientRepo } from "../repos/index.js";

const REGISTER_CACHE_TTL_MS = 5 * 60 * 1000;
const DANGEROUS_REDIRECT_SCHEMES = new Set([
	"javascript:",
	"data:",
	"vbscript:",
]);

type McpMetadata = {
	kind?: string;
	mcpClientType?: string;
	redirectNames?: Record<string, string>;
};

type RegistrationResponse = {
	body: {
		client_id: string;
		client_id_issued_at: number;
		client_name: string | null;
		redirect_uris: string[];
		scope: string;
		token_endpoint_auth_method: "none";
		grant_types: ["authorization_code", "refresh_token"];
		response_types: ["code"];
		public: true;
		type: "native";
	};
	status: 200 | 201;
};

const registerCache = new Map<string, { expiresAt: number; body: unknown }>();

const parseMetadata = (metadata: unknown): McpMetadata => {
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

const isLocalhost = (hostname: string) =>
	hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

export const isSafeOAuthRedirectUri = (redirectUri: string) => {
	if (!URL.canParse(redirectUri)) return false;

	const url = new URL(redirectUri);
	if (DANGEROUS_REDIRECT_SCHEMES.has(url.protocol)) return false;
	if (url.protocol === "http:") return isLocalhost(url.hostname);

	return true;
};

const normalize = (value: string) => value.trim().toLowerCase();

const getMcpClientName = (clientName: unknown) => {
	if (typeof clientName !== "string") return "MCP client";
	const trimmed = clientName.trim();
	return trimmed || "MCP client";
};

const classifyMcpClient = ({
	clientName,
	redirectUris,
}: {
	clientName: unknown;
	redirectUris: string[];
}): MpcClientInfo | null => {
	const haystack = [
		typeof clientName === "string" ? clientName : "",
		...redirectUris,
	]
		.join(" ")
		.toLowerCase();

	if (haystack.includes("cursor")) {
		return MCP_OAUTH_CLIENTS.find((client) => client.type === "cursor") ?? null;
	}
	if (haystack.includes("claude")) {
		return MCP_OAUTH_CLIENTS.find((client) => client.type === "claude") ?? null;
	}
	if (
		haystack.includes("opencode") ||
		haystack.includes("open-code") ||
		haystack.includes("open code")
	) {
		return (
			MCP_OAUTH_CLIENTS.find((client) => client.type === "opencode") ?? null
		);
	}
	if (haystack.includes("codex")) {
		return MCP_OAUTH_CLIENTS.find((client) => client.type === "codex") ?? null;
	}
	if (haystack.includes("slack")) {
		return MCP_OAUTH_CLIENTS.find((client) => client.type === "slack") ?? null;
	}

	return {
		type: "dynamic",
		name: getMcpClientName(clientName),
		clientId: generateId("oauth_client"),
	};
};

export const getRequestedScopesForMcpClient = ({
	clientType: _clientType,
	scope,
}: {
	clientType: MpcClientType;
	scope: unknown;
}) => {
	if (typeof scope !== "string" || !scope.trim()) {
		return getLeafMcpOAuthScopes();
	}
	return getLeafMcpOAuthScopes(scope.split(" "));
};

const mergeMetadata = ({
	client,
	info,
	redirectUris,
}: {
	client: OAuthClientRecord | null;
	info: MpcClientInfo;
	redirectUris: string[];
}) => {
	const existing = parseMetadata(client?.metadata);
	const redirectNames = { ...(existing.redirectNames ?? {}) };
	for (const redirectUri of redirectUris) {
		redirectNames[redirectUri] = info.name;
	}

	return {
		...existing,
		kind: MCP_CLIENT_KIND,
		mcpClientType: info.type,
		redirectNames,
	};
};

const clientMatches = ({
	client,
	info,
	redirectUris,
}: {
	client: OAuthClientRecord;
	info: MpcClientInfo;
	redirectUris: string[];
}) => {
	const metadata = parseMetadata(client.metadata);
	if (
		info.type !== "dynamic" &&
		metadata.kind === MCP_CLIENT_KIND &&
		metadata.mcpClientType === info.type
	) {
		return true;
	}
	if (client.clientId === info.clientId) return true;

	const requested = new Set(redirectUris);
	const hasMatchingRedirectUri = client.redirectUris.some((redirectUri) =>
		requested.has(redirectUri),
	);
	if (!hasMatchingRedirectUri) return false;

	if (normalize(client.name ?? "") === normalize(info.name)) return true;
	return (
		classifyMcpClient({
			clientName: client.name,
			redirectUris: client.redirectUris,
		})?.type === info.type
	);
};

const getCachedRegistration = (cacheKey: string) => {
	const cached = registerCache.get(cacheKey);
	if (!cached || cached.expiresAt < Date.now()) {
		registerCache.delete(cacheKey);
		return null;
	}

	return cached.body;
};

const setCachedRegistration = (cacheKey: string, body: unknown) => {
	registerCache.set(cacheKey, {
		expiresAt: Date.now() + REGISTER_CACHE_TTL_MS,
		body,
	});
};

const getRegistrationResponse = (
	client: OAuthClientRecord,
	status: 200 | 201,
): RegistrationResponse => ({
	body: {
		client_id: client.clientId,
		client_id_issued_at: client.createdAt
			? Math.floor(client.createdAt.getTime() / 1000)
			: Math.floor(Date.now() / 1000),
		client_name: client.name,
		redirect_uris: client.redirectUris,
		scope: client.scopes?.join(" ") ?? "",
		token_endpoint_auth_method: "none",
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		public: true,
		type: "native",
	},
	status,
});

export const registerMcpOAuthClient = async ({
	db,
	clientName,
	redirectUris,
	scope,
}: {
	db: DrizzleCli;
	clientName: unknown;
	redirectUris: string[];
	scope: unknown;
}): Promise<RegistrationResponse | { error: string; status: 400 }> => {
	if (redirectUris.length === 0) {
		return { error: "redirect_uris is required", status: 400 };
	}
	if (!redirectUris.every(isSafeOAuthRedirectUri)) {
		return { error: "invalid_redirect_uri", status: 400 };
	}

	const info = classifyMcpClient({ clientName, redirectUris });
	if (!info) {
		return { error: "unsupported_mcp_client", status: 400 };
	}

	const requestedScopes = getRequestedScopesForMcpClient({
		clientType: info.type,
		scope,
	});
	const scopeKey = [...requestedScopes].sort().join(" ");
	const cacheKey = `${info.type}:${[...redirectUris].sort().join("|")}:${scopeKey}`;
	const cached = getCachedRegistration(cacheKey);
	if (cached)
		return { body: cached as RegistrationResponse["body"], status: 200 };

	const clients = await oauthClientRepo.list({ db });
	const existingClient =
		clients.find((client) => clientMatches({ client, info, redirectUris })) ??
		null;
	const now = new Date();

	if (existingClient) {
		const mergedRedirectUris = [
			...new Set([...existingClient.redirectUris, ...redirectUris]),
		];

		const updatedClient = await oauthClientRepo.updateById({
			db,
			id: existingClient.id,
			updates: {
				name: info.name,
				redirectUris: mergedRedirectUris,
				scopes: requestedScopes,
				tokenEndpointAuthMethod: "none",
				grantTypes: ["authorization_code", "refresh_token"],
				responseTypes: ["code"],
				public: true,
				type: "native",
				metadata: mergeMetadata({ client: existingClient, info, redirectUris }),
				updatedAt: now,
			},
		});

		const response = getRegistrationResponse(updatedClient!, 200);
		setCachedRegistration(cacheKey, response.body);
		return response;
	}

	const client = await oauthClientRepo.upsert({
		db,
		insert: {
			id: generateId("oauth_client"),
			clientId: info.clientId,
			name: info.name,
			redirectUris,
			scopes: requestedScopes,
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: mergeMetadata({ client: null, info, redirectUris }),
			createdAt: now,
			updatedAt: now,
		},
		update: {
			name: info.name,
			redirectUris,
			scopes: requestedScopes,
			tokenEndpointAuthMethod: "none",
			grantTypes: ["authorization_code", "refresh_token"],
			responseTypes: ["code"],
			public: true,
			type: "native",
			metadata: mergeMetadata({ client: null, info, redirectUris }),
			updatedAt: now,
		},
	});

	const response = getRegistrationResponse(client!, 201);
	setCachedRegistration(cacheKey, response.body);
	return response;
};
