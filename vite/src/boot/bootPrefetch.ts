import { sandboxSlug as slugOf } from "../../../shared/models/orgModels/sandboxName";
import {
	ACTIVE_SANDBOX_STORAGE_KEY,
	bootRequestsForLocation,
	DASHBOARD_API_VERSION,
	dashboardRequestHeaders,
} from "./bootRequests";
import { type BootResponse, bootRequestKey } from "./bootResponses";

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

const readActiveSandbox = () => {
	try {
		const raw = localStorage.getItem(ACTIVE_SANDBOX_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as { id: string; name: string }) : null;
	} catch {
		return null;
	}
};

const fetchForBoot = (url: string, init: RequestInit = {}) =>
	fetch(url, { ...init, credentials: "include" })
		.then(
			async (response): Promise<BootResponse> => ({
				status: response.status,
				headers: Object.fromEntries(response.headers),
				body: await response.text(),
			}),
		)
		.catch(() => null);

/** Inlined into index.html: starts the session check, the landing page's data and its chunks while the entry bundle downloads. */
const startBootRequests = () => {
	const backendUrl = import.meta.env.VITE_BACKEND_URL as string;
	const authBaseUrl = backendUrl.startsWith("/")
		? window.location.origin
		: backendUrl;
	const responses = new Map<string, Promise<BootResponse | null>>();
	window.__autumnBoot = { startedAt: Date.now(), responses };

	const sessionUrl = `${authBaseUrl}/api/auth/get-session`;
	responses.set(bootRequestKey({ url: sessionUrl }), fetchForBoot(sessionUrl));

	const { env, sandboxSlug, route, requests } = bootRequestsForLocation(
		window.location,
	);
	if (route) preloadModules(__BOOT_ROUTE_ASSETS__[route] ?? []);

	// A named sandbox the app hasn't resolved yet sends a header we can't guess, so leave its data to the app.
	const sandbox = sandboxSlug ? readActiveSandbox() : null;
	if (sandboxSlug && slugOf(sandbox?.name ?? "") !== sandboxSlug) return;

	for (const { path, method = "GET", body } of requests) {
		const url = `${backendUrl}${path}`;
		const key = bootRequestKey({
			method,
			url,
			body,
			env,
			sandboxOrgId: sandbox?.id,
			apiVersion: DASHBOARD_API_VERSION,
		});
		responses.set(
			key,
			fetchForBoot(url, {
				method,
				body,
				headers: {
					...dashboardRequestHeaders({
						env,
						sandboxOrgId: sandbox?.id,
						apiVersion: DASHBOARD_API_VERSION,
					}),
					...(body && { "content-type": "application/json" }),
				},
			}),
		);
	}
};

try {
	startBootRequests();
} catch {}
