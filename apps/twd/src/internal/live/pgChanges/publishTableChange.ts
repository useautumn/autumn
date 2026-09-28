import { eq } from "drizzle-orm";
import type { LiveEvent } from "../../../api/contract.ts";
import { jobs } from "../../../db/schema/jobs.ts";
import { warmImages } from "../../../db/schema/runs.ts";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getCapacity } from "../../capacity/actions/getCapacity.ts";
import { selectApiJobs } from "../../jobs/repos/selectApiJobs.ts";
import { getRunWithEmail, toRunSummary } from "../../runs/repos/runsRepo.ts";
import { hasLiveSubscribers, publishLive } from "../liveHub/liveHub.ts";

const CAPACITY_DEBOUNCE_MS = 250;
let capacityTimer: ReturnType<typeof setTimeout> | undefined;

const scheduleCapacity = ({ ctx }: { ctx: TwdContext }) => {
	if (!hasLiveSubscribers({ topic: "capacity" })) return;
	capacityTimer ??= setTimeout(async () => {
		capacityTimer = undefined;
		publishLive({
			topic: "capacity",
			event: { type: "capacity.updated", capacity: await getCapacity({ ctx }) },
		});
	}, CAPACITY_DEBOUNCE_MS);
};

const SIGNAL_DEBOUNCE_MS = 250;
const signalTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** keys/accounts events carry no payload, so one per burst is enough. */
const publishSignal = ({
	topic,
	event,
}: {
	topic: "keys" | "accounts";
	event: LiveEvent;
}) => {
	if (signalTimers.has(topic) || !hasLiveSubscribers({ topic })) return;
	signalTimers.set(
		topic,
		setTimeout(() => {
			signalTimers.delete(topic);
			publishLive({ topic, event });
		}, SIGNAL_DEBOUNCE_MS),
	);
};

const publishRun = async ({
	ctx,
	runId,
}: {
	ctx: TwdContext;
	runId: string;
}) => {
	const runTopic = `run:${runId}`;
	if (
		!hasLiveSubscribers({ topic: "runs" }) &&
		!hasLiveSubscribers({ topic: runTopic })
	)
		return;
	const event = {
		type: "run.updated" as const,
		run: toRunSummary(await getRunWithEmail({ ctx, runId })),
	};
	publishLive({ topic: "runs", event });
	publishLive({ topic: runTopic, event });
};

const publishJob = async ({
	ctx,
	jobId,
}: {
	ctx: TwdContext;
	jobId: string;
}) => {
	if (!hasLiveSubscribers({ topic: "jobs" })) return;
	const [job] = await selectApiJobs({
		db: ctx.db,
		where: eq(jobs.id, jobId),
		limit: 1,
	});
	if (job) publishLive({ topic: "jobs", event: { type: "job.updated", job } });
};

const publishWarm = async ({ ctx, sha }: { ctx: TwdContext; sha: string }) => {
	if (!hasLiveSubscribers({ topic: "warm" })) return;
	const [row] = await ctx.db
		.select()
		.from(warmImages)
		.where(eq(warmImages.sha, sha));
	if (row)
		publishLive({
			topic: "warm",
			event: {
				type: "warm.updated",
				sha,
				branch: row.branch,
				status: row.status,
			},
		});
};

/** Maps one changed row (from the NOTIFY triggers) to the live events it implies. */
export const publishTableChange = async ({
	ctx,
	table,
	id,
}: {
	ctx: TwdContext;
	table: string;
	id: string;
}) => {
	scheduleCapacity({ ctx });
	if (table === "runs") return publishRun({ ctx, runId: id });
	if (table === "jobs") return publishJob({ ctx, jobId: id });
	if (table === "warm_images") return publishWarm({ ctx, sha: id });
	if (table === "stripe_accounts" || table === "reservations")
		return publishLive({
			topic: "accounts",
			event: { type: "accounts.changed" },
		});
	if (table === "stripe_keys" || table === "key_gate")
		return publishSignal({ topic: "keys", event: { type: "keys.changed" } });
};
