import { createServer } from "node:http";
import {
	generateCodeVerifier,
	generateState,
	type OAuth2Client,
	OAuth2RequestError,
} from "arctic";
import {
	buildAuthorizationUrl,
	createOAuthClient,
} from "./buildAuthorizationUrl";
import { renderErrorPage, renderSuccessPage } from "./callbackPages";
import { getTokenEndpoint, OAUTH_PORTS } from "./oauthConfig";
import type { OAuthTokens } from "./types/oauthTokens";

const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000;

export type AuthorizationUrlListener = ({
	url,
}: {
	url: string;
}) => Promise<void> | void;

export type RunOAuthFlowOptions = {
	clientId: string;
	backendUrl: string;
	scopes: readonly string[];
	onAuthorizationUrl: AuthorizationUrlListener;
};

type CallbackOutcome = { page: string; tokens?: OAuthTokens; error?: Error };

const failedCallback = ({ message }: { message: string }): CallbackOutcome => ({
	page: renderErrorPage({ message }),
	error: new Error(message),
});

const exchangeAuthorizationCode = async ({
	client,
	backendUrl,
	code,
	codeVerifier,
}: {
	client: OAuth2Client;
	backendUrl: string;
	code: string;
	codeVerifier: string;
}): Promise<CallbackOutcome> => {
	try {
		const tokens = await client.validateAuthorizationCode(
			getTokenEndpoint({ backendUrl }),
			code,
			codeVerifier,
		);
		return {
			page: renderSuccessPage(),
			tokens: {
				accessToken: tokens.accessToken(),
				tokenType: "Bearer",
				expiresInSeconds: tokens.accessTokenExpiresInSeconds(),
				refreshToken: tokens.hasRefreshToken()
					? tokens.refreshToken()
					: undefined,
			},
		};
	} catch (error) {
		const message =
			error instanceof OAuth2RequestError
				? `OAuth error: ${error.code}`
				: "Token exchange failed";
		return failedCallback({ message });
	}
};

const readCallback = async ({
	callbackUrl,
	client,
	backendUrl,
	state,
	codeVerifier,
}: {
	callbackUrl: URL;
	client: OAuth2Client;
	backendUrl: string;
	state: string;
	codeVerifier: string;
}): Promise<CallbackOutcome> => {
	const denial = callbackUrl.searchParams.get("error");
	if (denial) {
		return failedCallback({
			message: callbackUrl.searchParams.get("error_description") ?? denial,
		});
	}
	if (callbackUrl.searchParams.get("state") !== state) {
		return failedCallback({ message: "Invalid state — possible CSRF" });
	}

	const code = callbackUrl.searchParams.get("code");
	if (!code) return failedCallback({ message: "Missing authorization code" });

	return await exchangeAuthorizationCode({
		client,
		backendUrl,
		code,
		codeVerifier,
	});
};

/** Resolves null when the port is taken, so the caller can try the next one. */
const listenForCallback = ({
	port,
	onCallback,
	onListening,
}: {
	port: number;
	onCallback: ({
		callbackUrl,
	}: {
		callbackUrl: URL;
	}) => Promise<CallbackOutcome>;
	onListening: () => void;
}): Promise<OAuthTokens | null> =>
	new Promise((resolve, reject) => {
		const server = createServer(async (request, response) => {
			const callbackUrl = new URL(
				request.url ?? "/",
				`http://localhost:${port}`,
			);
			if (callbackUrl.pathname !== "/") {
				response.writeHead(404).end("Not found");
				return;
			}

			const { page, tokens, error } = await onCallback({ callbackUrl });
			clearTimeout(timeout);

			// Settle only once the page is flushed — the browser's keep-alive socket
			// would otherwise outlive the command and hang the CLI.
			response.writeHead(200, { "Content-Type": "text/html" }).end(page, () => {
				shutDown();
				if (tokens) resolve(tokens);
				else reject(error ?? new Error("Authorization returned no tokens"));
			});
		});

		const shutDown = () => {
			server.close();
			server.closeAllConnections();
		};

		const timeout = setTimeout(() => {
			shutDown();
			reject(new Error("Authorization timed out. Please try again."));
		}, AUTHORIZATION_TIMEOUT_MS);

		server.once("error", (error: NodeJS.ErrnoException) => {
			clearTimeout(timeout);
			if (error.code === "EADDRINUSE") resolve(null);
			else reject(error);
		});

		server.listen(port, onListening);
	});

/**
 * PKCE authorization against a loopback callback. The URL is handed to the
 * caller the moment the server is listening, so it can be shown and opened.
 */
export const runOAuthFlow = async ({
	clientId,
	backendUrl,
	scopes,
	onAuthorizationUrl,
}: RunOAuthFlowOptions): Promise<OAuthTokens> => {
	const codeVerifier = generateCodeVerifier();
	const state = generateState();

	for (const port of OAUTH_PORTS) {
		const client = createOAuthClient({ clientId, port });
		const authorizationUrl = buildAuthorizationUrl({
			client,
			backendUrl,
			scopes,
			state,
			codeVerifier,
		});

		const tokens = await listenForCallback({
			port,
			onCallback: ({ callbackUrl }) =>
				readCallback({
					callbackUrl,
					client,
					backendUrl,
					state,
					codeVerifier,
				}),
			onListening: () => {
				void Promise.resolve(
					onAuthorizationUrl({ url: authorizationUrl.toString() }),
				).catch(() => {
					// Announcing is best-effort; the flow still works if it fails.
				});
			},
		});

		if (tokens) return tokens;
	}

	throw new Error(
		`All OAuth callback ports (${OAUTH_PORTS.at(0)}-${OAUTH_PORTS.at(-1)}) are in use.`,
	);
};
