import type { PublicServiceUrls } from "../devProxy/cloudflareConfig.ts";
import { publicServiceUrlsFromDashboard } from "../devProxy/cloudflareConfig.ts";
import type { RegistryEntry, WorktreeAliases } from "../types.ts";
import { emulateGoogleUrl } from "./emulate.ts";
import {
	checkoutPortFor,
	EMULATE_PORT,
	leafPortFor,
	serverPortFor,
	vitePortFor,
} from "./ports.ts";

export function entryPublicOrigin(
	entry: Pick<RegistryEntry, "ngrokUrl" | "publicUrl">,
): string | undefined {
	const raw = entry.publicUrl ?? entry.ngrokUrl;
	if (raw?.startsWith("https://")) return raw.replace(/\/$/, "");
	return undefined;
}

export function entryPublicServiceUrls(
	entry: Pick<RegistryEntry, "ngrokUrl" | "publicUrl">,
): PublicServiceUrls | undefined {
	const dashboard = entryPublicOrigin(entry);
	if (!dashboard) return undefined;
	return publicServiceUrlsFromDashboard({ dashboard });
}

export function loopbackServiceUrls({
	worktreeNum,
}: {
	worktreeNum: number;
}): PublicServiceUrls {
	return {
		api: `http://localhost:${serverPortFor(worktreeNum)}`,
		checkout: `http://localhost:${checkoutPortFor(worktreeNum)}`,
		emulate: `http://localhost:${EMULATE_PORT}`,
		leaf: `http://localhost:${leafPortFor(worktreeNum)}`,
		vite: `http://localhost:${vitePortFor(worktreeNum)}`,
	};
}

/** Cloud / `DW_HEADLESS` only: browser-facing URLs are the public service hosts. */
export function publicDevEnv({
	urls,
	worktreeNum,
}: {
	urls: PublicServiceUrls;
	worktreeNum: number;
}): Record<string, string> {
	const serverPort = serverPortFor(worktreeNum);
	return {
		AUTUMN_API_URL: `http://localhost:${serverPort}`,
		AUTUMN_PUBLIC_API_URL: urls.api,
		CHAT_SERVER_URL: `http://localhost:${leafPortFor(worktreeNum)}`,
		CLIENT_URL: urls.vite,
		EMULATE_GOOGLE_FETCH_URL: `http://127.0.0.1:${EMULATE_PORT}`,
		EMULATE_GOOGLE_URL: emulateGoogleUrl({ origin: urls.emulate }),
		MCP_SERVER_URL: urls.api,
		SLACK_REDIRECT_URI: `${urls.api}/slack/oauth/callback`,
		VITE_API_URL: urls.api,
		VITE_BACKEND_URL: urls.api,
		VITE_CHECKOUT_URL: urls.checkout,
		VITE_FRONTEND_URL: urls.vite,
	};
}

/**
 * Laptop / portless: page, API, and Google OAuth stay on `wtN*.localhost`.
 * A public autumnworktree tunnel must not leak into `VITE_BACKEND_URL`.
 */
export function laptopDevEnv({
	aliases,
}: {
	aliases: Pick<WorktreeAliases, "apiUrl" | "viteUrl">;
}): Record<string, string> {
	return {
		AUTUMN_API_URL: aliases.apiUrl,
		AUTUMN_PUBLIC_API_URL: aliases.apiUrl,
		CLIENT_URL: aliases.viteUrl,
		EMULATE_GOOGLE_FETCH_URL: `http://127.0.0.1:${EMULATE_PORT}`,
		EMULATE_GOOGLE_URL: emulateGoogleUrl({}),
		VITE_BACKEND_URL: aliases.apiUrl,
		VITE_FRONTEND_URL: aliases.viteUrl,
	};
}
