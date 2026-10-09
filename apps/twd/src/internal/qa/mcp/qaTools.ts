import { z } from "zod/v4";
import type { QaEnv } from "../../../api/contract.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { toolOk } from "../../mcp/actions/toolResult.ts";
import { defineTool } from "../../mcp/actions/toolServer.ts";
import { createQaEnv } from "../actions/createQaEnv.ts";
import {
	execInQaEnv,
	getQaEnvLogs,
	QA_SERVICES,
	restartQaEnv,
} from "../actions/debugQaEnv.ts";
import { deleteQaEnv } from "../actions/deleteQaEnv.ts";
import { getQaEnv, listQaEnvs } from "../actions/listQaEnvs.ts";
import { waitForWarmQaEnv } from "../actions/waitForWarmQaEnv.ts";

const NAME = z
	.string()
	.regex(/^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/)
	.describe("DNS label: lowercase letters, digits, hyphens.");

const describeEnv = (env: QaEnv) =>
	`${env.url} (${env.ref}@${env.sha.slice(0, 12)}) is ${env.state}${env.building ? `, building: ${env.building.phase}, ~${Math.ceil(env.building.remainingMs / 1000)}s left` : ""}${env.awake === null ? "" : env.awake ? ", awake" : ", asleep"}; expires ${env.expiresAt}.`;

/** qa_create / qa_status / qa_list / qa_delete: per-branch QA envs on <name>.atmn.lol. */
export const qaTools = ({ ctx }: { ctx: TwdContext }) => [
	defineTool({
		name: "qa_create",
		description:
			"Hand a pushed branch to a human for QA: deploys it as https://<name>.atmn.lol with the full Autumn stack (dashboard, server, workers, Stripe sandbox webhooks), logged in as Capy Admin, on a 3-day Neon branch of your Capy branch. Returns the URL immediately; the build takes ~2-3 min (the URL shows live progress) and the env boots itself as soon as it finishes, so the link is warm when opened. It sleeps after 5 min idle and opening the URL wakes it (~25 s). Re-using a name re-ships that env at the new commit and keeps its QA data (freshDb: true re-branches the DB). Pass supersedes to delete your previous env in the same call. parentBranch is `branchName` and secrets are the `secrets` object from ~/.autumn-capy/state.json.",
		input: z.object({
			ref: z.string().min(1).describe("Pushed branch (or full sha)."),
			name: NAME.optional().describe(
				"Defaults to the branch name, slugified. Re-use it to re-ship.",
			),
			parentBranch: z
				.string()
				.min(1)
				.describe(
					"Your Capy Neon branch: branchName in ~/.autumn-capy/state.json.",
				),
			secrets: z
				.object({
					BETTER_AUTH_SECRET: z.string().min(1),
					ENCRYPTION_IV: z.string().min(1),
					ENCRYPTION_PASSWORD: z.string().min(1),
				})
				.describe(
					"From ~/.autumn-capy/state.json `secrets` (betterAuthSecret, encryptionIv, encryptionPassword).",
				),
			supersedes: NAME.optional().describe(
				"Another env of yours to delete once this one is created.",
			),
			freshDb: z.boolean().optional(),
			wait: z
				.boolean()
				.optional()
				.describe(
					"Return only once the env is built and warm (~3-4 min, capped at 9). Use it when you'd rather hand over a link that opens instantly.",
				),
		}),
		run: async ({ wait, ...body }) => {
			const result = await createQaEnv({ ctx, body });
			if (wait) {
				const { env, warm } = await waitForWarmQaEnv({
					ctx,
					name: result.env.name,
				});
				return toolOk({
					summary: warm
						? `QA env is warm: ${describeEnv(env)} Give the human the URL; it opens instantly.`
						: `QA env is not warm yet: ${describeEnv(env)}${env.error ? ` Error: ${env.error}` : " Give the human the URL anyway; it shows progress until ready."}`,
					data: { ...result, env, warm },
				});
			}
			return toolOk({
				summary: `QA env ${result.deduped ? "re-ship already in progress" : "build started"}: ${describeEnv(result.env)} Give the human the URL now; it shows build progress until ready.`,
				data: result,
			});
		},
	}),
	defineTool({
		name: "qa_status",
		description: "One QA env's state, build progress, awake/asleep and expiry.",
		input: z.object({ name: NAME }),
		run: async ({ name }) => {
			const env = await getQaEnv({ ctx, name });
			return toolOk({ summary: describeEnv(env), data: env });
		},
	}),
	defineTool({
		name: "qa_list",
		description:
			"List live QA envs (newest first) with state, URL, ref and expiry.",
		input: z.object({}),
		run: async () => {
			const envs = await listQaEnvs({ ctx });
			return toolOk({ summary: `${envs.length} QA env(s).`, data: envs });
		},
	}),
	defineTool({
		name: "qa_delete",
		description:
			"Delete a QA env now: container, URL, Stripe routing and its Neon branch. Envs also delete themselves after 3 days.",
		input: z.object({ name: NAME }),
		run: async ({ name }) =>
			toolOk({
				summary: `Deleted ${name}.`,
				data: await deleteQaEnv({ ctx, name }),
			}),
	}),
	defineTool({
		name: "qa_logs",
		description:
			"Tail one service's log in a QA env (wakes it if asleep). Services: boot, server, workers, cron, balance-worker, kafka, dragonfly, fakecloud, proxy. Logs start fresh on every wake.",
		input: z.object({
			name: NAME,
			service: z.enum(QA_SERVICES).default("server"),
			lines: z.number().int().min(1).max(2000).default(200),
		}),
		run: async ({ name, service, lines }) => {
			const { output } = await getQaEnvLogs({ ctx, name, service, lines });
			return toolOk({
				summary: `Last ${lines} lines of ${service} in ${name}.`,
				data: { text: output },
			});
		},
	}),
	defineTool({
		name: "qa_exec",
		description:
			"Run a bash command inside a QA env (wakes it if asleep), with its runtime env: `psql \"$DATABASE_URL\" -c '...'` queries or fixes its Neon branch, `curl localhost:8080/...` hits the server, files live under /app and logs under /var/qa/logs. Changes to files are lost when the env sleeps; database changes persist. Use it to debug a QA env or set up data the human asked for.",
		input: z.object({ name: NAME, command: z.string().min(1).max(20_000) }),
		run: async ({ name, command }) => {
			const result = await execInQaEnv({ ctx, name, command });
			return toolOk({
				summary: `Exit ${result.exitCode} in ${name}.`,
				data: result,
			});
		},
	}),
	defineTool({
		name: "qa_restart",
		description:
			"Restart a QA env's whole stack from its build (fresh Dragonfly, Kafka and queues; database kept). Use when it is wedged; waits until it is ready (~40 s).",
		input: z.object({ name: NAME }),
		run: async ({ name }) => {
			const result = await restartQaEnv({ ctx, name });
			return toolOk({
				summary: result.ready
					? `${name} restarted and ready.`
					: `${name} restarted but is not ready yet.`,
				data: result,
			});
		},
	}),
];
