/**
 * Image-attachment e2e for both chat surfaces against the local dev stack
 * (eve :3999, main server :8080). Slack path drives runMessage in-process;
 * web path drives streamWebChat with a data-URL file part.
 *
 * Run from apps/leaf:
 *   EVE_INTERNAL_AUTH_TOKEN=local-eve-internal-token \
 *     infisical run --env=dev --recursive -- bun tests/e2e/eveImage.e2e.ts
 */
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import { runMessage } from "../../src/agent/runMessage/runMessage.js";
import { db } from "../../src/lib/db.js";
import { logger } from "../../src/lib/logger.js";
import { createEveSlackPresenter } from "../../src/providers/slack/evePresenter.js";
import { findInstallationWithOrg } from "../../src/providers/slack/installations.js";
import { streamWebChat } from "../../src/providers/web/streamWebChat.js";
import type { LeafChatInstallation } from "../../src/types.js";
import { createStatusTicker } from "../../src/ui/statusTicker.js";

const WORKSPACE_ID = process.env.E2E_SLACK_WORKSPACE ?? "T07NPTDCU69";
const RUN_TAG = Date.now().toString(36);

const RED_PIXEL_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAgElEQVR4nO3RwQkAMAwDMe+/dDtEH6Jw4AES3c729fwFPaAJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJK6AJKzCv+LILqdzw4i4ZAl4AAAAASUVORK5CYII=",
	"base64",
);
const PROMPT =
	"In sandbox (no tools needed): the attached image is a solid single-color swatch. What color is it? Answer with just the color name.";

type CheckResult = { detail?: string; name: string; ok: boolean };
const results: CheckResult[] = [];
const check = (name: string, ok: boolean, detail?: string) => {
	results.push({ detail, name, ok });
	console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const runSlackImageTurn = async ({
	installation,
}: {
	installation: LeafChatInstallation;
}) => {
	const statuses: string[] = [];
	const target = {
		post: async () => undefined,
		startTyping: async (text?: string) => {
			statuses.push(text ?? "");
		},
	};
	const ticker = createStatusTicker(target as never);
	const presenter = createEveSlackPresenter({ ticker });
	const threadId = `e2e-img-${RUN_TAG}-slack`;
	const output = await runMessage({
		attachments: [
			{
				data: RED_PIXEL_PNG,
				mimeType: "image/png",
				name: "pixel.png",
				size: RED_PIXEL_PNG.byteLength,
				type: "file" as const,
			},
		],
		channelId: threadId,
		installation,
		logger,
		onAction: (message) => presenter.onAction(message),
		onActionKeyed: ({ message }) => presenter.onActionError(message),
		onReasoning: presenter.onReasoning,
		onThinking: ticker.thinking,
		providerUserId: "U_E2E_ALICE",
		text: PROMPT,
		threadId,
	});
	ticker.stop();
	return { output, statuses };
};

const runWebImageTurn = async ({
	installation,
}: {
	installation: LeafChatInstallation;
}) => {
	const userId = installation.installed_by_user_id;
	if (!userId) {
		throw new Error(
			"Slack installation has no installed_by_user_id to reuse for web auth",
		);
	}
	if (process.env.E2E_DEBUG) {
		const { ensureWebChatAuth } = await import(
			"../../src/internal/installations/actions/ensureWebChatAuth.js"
		);
		const { getOrgInstallationToken } = await import(
			"../../src/internal/installations/actions/getOrgInstallationToken.js"
		);
		await ensureWebChatAuth({
			orgId: installation.org_id,
			userId,
			userScopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
		});
		await getOrgInstallationToken({
			env: "sandbox" as never,
			orgId: installation.org_id,
			provider: "web" as never,
			userId,
			workspaceId: installation.org_id,
		});
		console.log("  [web-debug] auth preflight ok");
	}
	const request = new Request("http://localhost/agent/chat", {
		body: JSON.stringify({
			id: crypto.randomUUID(),
			messages: [
				{
					id: crypto.randomUUID(),
					parts: [
						{ text: PROMPT, type: "text" },
						{
							filename: "pixel.png",
							mediaType: "image/png",
							type: "file",
							url: `data:image/png;base64,${RED_PIXEL_PNG.toString("base64")}`,
						},
					],
					role: "user",
				},
			],
		}),
		headers: { app_env: "sandbox", "content-type": "application/json" },
		method: "POST",
	});
	const response = await streamWebChat({
		auth: {
			orgId: installation.org_id,
			scopes: [...DEFAULT_OAUTH_RESOURCE_SCOPES],
			userId,
		},
		request,
	});
	if (!response.ok || !response.body) {
		throw new Error(`web chat stream returned ${response.status}`);
	}
	let text = "";
	let sse = "";
	const decoder = new TextDecoder();
	for await (const chunk of response.body) {
		sse += decoder.decode(chunk as Uint8Array, { stream: true });
		let index = sse.indexOf("\n");
		while (index >= 0) {
			const line = sse.slice(0, index).trim();
			sse = sse.slice(index + 1);
			if (line.startsWith("data: ") && line !== "data: [DONE]") {
				const part = JSON.parse(line.slice(6)) as {
					delta?: string;
					type: string;
				};
				if (process.env.E2E_DEBUG) {
					console.log("  [web-part]", JSON.stringify(part).slice(0, 200));
				}
				if (part.type === "text-delta" && part.delta) text += part.delta;
			}
			index = sse.indexOf("\n");
		}
	}
	return { text };
};

const main = async () => {
	console.log(`\n=== eve image e2e (tag ${RUN_TAG}) ===\n`);
	const installation = (await findInstallationWithOrg(
		"slack",
		WORKSPACE_ID,
	)) as LeafChatInstallation | null;
	if (!installation) {
		throw new Error(`No slack installation for workspace ${WORKSPACE_ID}`);
	}
	console.log(`Installation org=${installation.org_id}`);

	if (process.env.E2E_ONLY !== "web") {
		console.log("--- slack surface");
		const slack = await runSlackImageTurn({ installation });
		const slackText = slack.output.text ?? "";
		check(
			"slack: model saw the image",
			/red/i.test(slackText),
			slackText.slice(0, 140),
		);
		check(
			"slack: status cleared after run (stuck-thinking fix)",
			slack.statuses.at(-1) === "",
			JSON.stringify(slack.statuses.slice(-3)),
		);
	}

	console.log("--- web surface");
	const web = await runWebImageTurn({ installation });
	check(
		"web: model saw the image",
		/red/i.test(web.text),
		web.text.slice(0, 140),
	);

	const failed = results.filter((result) => !result.ok);
	console.log(
		`\n${failed.length === 0 ? "ALL PASS" : `${failed.length} FAILED`} (${results.length} checks)`,
	);
	process.exit(failed.length === 0 ? 0 : 1);
};

await main().finally(() => db.$client.end?.());
