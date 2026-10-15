import { sandboxSlug as slugOf } from "../../../shared/models/orgModels/sandboxName";
import {
	ACTIVE_SANDBOX_STORAGE_KEY,
	type BootResponse,
	bootRequestKey,
	bootRequestsForLocation,
	DASHBOARD_API_VERSION,
} from "./bootRequests";

declare const __BOOT_ROUTE_ASSETS__: Partial<Record<string, string[]>>;

const preloadModules = (files: string[]) => {
	for (const file of files) {
		const link = document.createElement("link");
		link.rel = "modulepreload";
		link.crossOrigin = "";
		link.href = file;
		document.head.appendChild(link);
	}
};

/** Inlined into index.html: fires the session check, the landing page's data and its chunks while the entry bundle downloads. */
const startBootRequests = () => {
	const backendUrl = import.meta.env.VITE_BACKEND_URL as string;
	const authBaseUrl = backendUrl.startsWith("/")
		? window.location.origin
		: backendUrl;
	const responses = new Map<string, Promise<BootResponse | null>>();
	window.__autumnBoot = { startedAt: Date.now(), responses };

	const request = (url: string, init: RequestInit = {}) =>
		fetch(url, { ...init, credentials: "include" })
			.then(
				async (response): Promise<BootResponse> => ({
					status: response.status,
					headers: Object.fromEntries(response.headers),
					body: await response.text(),
				}),
			)
			.catch(() => null);

	const sessionUrl = `${authBaseUrl}/api/auth/get-session`;
	responses.set(bootRequestKey({ url: sessionUrl }), request(sessionUrl));

	const { env, sandboxSlug, route, requests } = bootRequestsForLocation(
		window.location,
	);
	if (route) preloadModules(__BOOT_ROUTE_ASSETS__[route] ?? []);
	const activeSandbox = (() => {
		try {
			const raw = localStorage.getItem(ACTIVE_SANDBOX_STORAGE_KEY);
			return raw ? (JSON.parse(raw) as { id: string; name: string }) : null;
		} catch {
			return null;
		}
	})();
	// A slug we can't resolve offline is settled by the app; its requests carry a header we can't guess.
	if (sandboxSlug && slugOf(activeSandbox?.name ?? "") !== sandboxSlug) return;
	const sandboxOrgId =
		env === "sandbox" && sandboxSlug ? activeSandbox?.id : undefined;

	for (const { path, method = "GET", body } of requests) {
		const url = `${backendUrl}${path}`;
		responses.set(
			bootRequestKey({
				method,
				url,
				body,
				env,
				sandboxOrgId,
				apiVersion: DASHBOARD_API_VERSION,
			}),
			request(url, {
				method,
				body,
				headers: {
					app_env: env,
					"x-api-version": DASHBOARD_API_VERSION,
					"x-client-type": "dashboard",
					...(body && { "content-type": "application/json" }),
					...(sandboxOrgId && { "x-sandbox-org-id": sandboxOrgId }),
				},
			}),
		);
	}
};

try {
	startBootRequests();
} catch {}
