import type { RunFile } from "../../../api/contract.ts";
import type { LiveRun } from "../live/liveRuns.ts";
import {
	type EtaPriors,
	estimateRunEta,
	type RunEta,
} from "./estimateRunEta.ts";

const toMs = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

/** Remembers when each file's current attempt landed on its worker, which RunFile doesn't carry. */
export const createRunEtaTracker = ({
	priors,
	plannedFiles,
}: {
	priors: EtaPriors;
	plannedFiles: string[];
}) => {
	const started = new Map<string, { attempt: string; at: number }>();

	const noteFile = ({ file, now }: { file: RunFile; now: number }) => {
		if (file.status !== "running" || !file.worker) return;
		const attempt = `${file.attempt}:${file.worker}`;
		if (started.get(file.file)?.attempt === attempt) return;
		started.set(file.file, { attempt, at: now });
	};

	const estimate = ({
		live,
		moreWorkersWanted,
		now,
		slotsPerWorker,
	}: {
		live: LiveRun;
		moreWorkersWanted: number;
		now: number;
		slotsPerWorker: number;
	}): RunEta | null =>
		estimateRunEta({
			now,
			files: plannedFiles.map((id) => {
				const file = live.files.get(id);
				return {
					file: id,
					status: file?.status ?? "queued",
					durationMs: file?.durationMs ?? null,
					finishedAt: toMs(file?.finishedAt),
					startedAt:
						file?.status === "running" ? (started.get(id)?.at ?? null) : null,
					worker: file?.worker ?? null,
					attempt: file?.attempt ?? 0,
				};
			}),
			workers: [...live.workers.values()],
			moreWorkersWanted,
			priors,
			slotsPerWorker,
		});

	return { noteFile, estimate };
};
