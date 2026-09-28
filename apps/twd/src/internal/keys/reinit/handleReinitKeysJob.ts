import { and, count, eq, inArray } from "drizzle-orm";
import pLimit from "p-limit";
import { jobs } from "../../../db/schema/jobs.ts";
import { stripeKeys } from "../../../db/schema/keys.ts";
import { runs } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import type { JobHandler } from "../../jobs/types/jobHandler.ts";
import {
	deleteAllWebhooks,
	registerConnectWebhook,
} from "../actions/connectWebhooks.ts";
import { discoverPoolAccounts } from "../actions/discoverPoolAccounts.ts";
import { syncKeys } from "../actions/syncKeys.ts";
import { topUpAccounts } from "../actions/topUpAccounts.ts";
import { knownKeySecrets, peekKeySecret } from "../keySecrets.ts";
import { isFullNukeLockReason } from "../repos/fullNukeLockRepo.ts";
import { setKeyGate } from "../repos/keyGateRepo.ts";

const PHASES = [
	"drain",
	"delete_webhooks",
	"register_webhooks",
	"discover_accounts",
	"top_up",
	"probe",
] as const;
type Phase = (typeof PHASES)[number];

const LIVE_RUN_STATUSES = [
	"queued",
	"warming",
	"provisioning",
	"running",
	"tearing_down",
] as const;
const DRAIN_POLL_MS = 5_000;
const DRAIN_LOG_EVERY_MS = 60_000;
/** ~445 keys: parallel across keys, each key is its own Stripe rate-limit bucket. */
const KEY_CONCURRENCY = 16;

const sleep = ({ ms, signal }: { ms: number; signal: AbortSignal }) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new Error("reinit_keys aborted"));
			},
			{ once: true },
		);
	});

const countBlockers = async ({ ctx }: { ctx: TwdContext }) => {
	const [[liveRuns], [liveNukes]] = await Promise.all([
		ctx.db
			.select({ n: count() })
			.from(runs)
			.where(inArray(runs.status, [...LIVE_RUN_STATUSES])),
		ctx.db
			.select({ n: count() })
			.from(jobs)
			.where(
				and(eq(jobs.kind, "nuke"), inArray(jobs.status, ["queued", "running"])),
			),
	]);
	return { liveRuns: liveRuns.n, liveNukes: liveNukes.n };
};

/**
 * payload: { targetPerKey? }. Gate draining → wait for live runs + nukes → wipe webhooks on every
 * stored key → one Connect webhook per usable key → discover/top-up accounts → re-probe → open.
 */
export const handleReinitKeysJob: JobHandler = async ({
	ctx,
	job,
	checkpoint,
	signal,
}) => {
	const keyLimit = pLimit(KEY_CONCURRENCY);
	const targetPerKey = Number(job.payload.targetPerKey) || 0;
	const resumeAt = PHASES.indexOf(job.state.phase as Phase);
	let phase: Phase = resumeAt >= 0 ? PHASES[resumeAt] : "drain";
	const enter = async (next: Phase) => {
		phase = next;
		await checkpoint({ phase });
		ctx.logger.info("twd reinit_keys phase", { jobId: job.id, phase });
	};
	const reached = (target: Phase) =>
		PHASES.indexOf(phase) <= PHASES.indexOf(target);

	await setKeyGate({
		db: ctx.db,
		gate: {
			state: "draining",
			reason: "re-initialising Stripe keys",
			jobId: job.id,
		},
	});

	try {
		await syncKeys({ ctx });
		if (knownKeySecrets().length === 0) {
			throw new Error(
				"no stored key resolves to a Stripe account — import keys on the Stripe keys page",
			);
		}

		if (reached("drain")) {
			await enter("drain");
			let lastLog = 0;
			for (;;) {
				const blockers = await countBlockers({ ctx });
				if (blockers.liveRuns === 0 && blockers.liveNukes === 0) break;
				if (Date.now() - lastLog > DRAIN_LOG_EVERY_MS) {
					ctx.logger.info("twd reinit_keys draining", blockers);
					lastLog = Date.now();
				}
				await checkpoint({ phase, ...blockers });
				await sleep({ ms: DRAIN_POLL_MS, signal });
			}
		}

		// A full nuke owns its key's webhooks until it finishes.
		const keys = (
			await ctx.db.select().from(stripeKeys).where(eq(stripeKeys.present, true))
		).filter((key) => !isFullNukeLockReason(key.unusableReason));

		if (reached("delete_webhooks")) {
			await enter("delete_webhooks");
			await Promise.all(
				keys.map((key) =>
					keyLimit(async () => {
						const secret = peekKeySecret({
							platformAccountId: key.platformAccountId,
						});
						if (!secret) return;
						const deleted = await deleteAllWebhooks({
							ctx,
							platformAccountId: key.platformAccountId,
							secret,
						});
						key.connectWebhookId = null;
						ctx.logger.info("twd reinit_keys webhooks deleted", {
							platformAccountId: key.platformAccountId,
							deleted,
						});
					}),
				),
			);
		}

		if (reached("register_webhooks")) {
			await enter("register_webhooks");
			await Promise.all(
				keys.map((key) =>
					keyLimit(async () => {
						const secret = peekKeySecret({
							platformAccountId: key.platformAccountId,
						});
						if (!key.usable || !secret || key.connectWebhookId) return;
						await registerConnectWebhook({
							ctx,
							platformAccountId: key.platformAccountId,
							secret,
						});
					}),
				),
			);
		}

		if (reached("discover_accounts")) {
			await enter("discover_accounts");
			await discoverPoolAccounts({ ctx });
		}

		if (reached("top_up") && targetPerKey > 0) {
			await enter("top_up");
			await topUpAccounts({ ctx, targetPerKey });
		}

		await enter("probe");
		await syncKeys({ ctx });
		const [usable] = await ctx.db
			.select({ n: count() })
			.from(stripeKeys)
			.where(and(eq(stripeKeys.usable, true), eq(stripeKeys.present, true)));
		if (usable.n === 0) {
			throw new Error(
				"re-probe found no usable keys (Connect / v2 Accounts API) — check the keys on the Stripe keys page",
			);
		}
	} catch (error) {
		if (!signal.aborted) {
			await setKeyGate({
				db: ctx.db,
				gate: {
					state: "draining",
					reason: `reinit failed during ${phase}: ${(error as Error).message}. Rerun POST /keys/reinit.`,
					jobId: job.id,
				},
			});
		}
		throw error;
	}

	await setKeyGate({
		db: ctx.db,
		gate: { state: "open", reason: null, jobId: null },
	});
};
