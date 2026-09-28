import defaultCtx from "@tests/utils/testInitUtils/createTestContext.js";
import { createSvixCli } from "@/external/svix/svixUtils.js";

const apiBase = `${(process.env.AUTUMN_TEST_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "")}/v1`;

export const testOrgSandboxAppId = () => {
	const appId = defaultCtx.org.svix_config?.sandbox_app_id;
	if (!appId) throw new Error("test org has no sandbox Svix app");
	return appId;
};

const postRpc = async ({
	path,
	body,
	key = defaultCtx.orgSecretKey,
}: {
	path: string;
	body: unknown;
	key?: string;
}) => {
	const res = await fetch(`${apiBase}/${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	// biome-ignore lint/suspicious/noExplicitAny: response shapes vary per route
	return { status: res.status, body: (await res.json()) as any };
};

/** Raw POST so tests see status codes, not AutumnInt's thrown errors. */
export const postWebhooks = ({
	route,
	...rest
}: {
	route: string;
	body: unknown;
	key?: string;
}) => postRpc({ path: `webhooks.${route}`, ...rest });

export const postSandboxes = ({
	route,
	...rest
}: {
	route: string;
	body: unknown;
	key?: string;
}) => postRpc({ path: `sandboxes.${route}`, ...rest });

/** Real Svix endpoints outlive the test run, so tests delete what they made. */
export const deleteSvixEndpoints = async ({
	appId,
	ids,
}: {
	appId: string;
	ids: string[];
}) => {
	const svix = createSvixCli();
	await Promise.all(
		ids.map((id) => svix.endpoint.delete(appId, id).catch(() => {})),
	);
};
