import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
	type RunDetail,
	RunEvent,
	type RunFile,
} from "../../../src/api/contract.ts";
import { transport } from "./client.ts";
import { qk } from "./hooks.ts";

export type LogLine = {
	file: string | null;
	worker: string | null;
	text: string;
};

const TERMINAL = new Set(["passed", "failed", "cancelled", "errored"]);
const MAX_LOG_LINES = 400;

const upsert = <T>(list: T[], item: T, same: (a: T) => boolean) => {
	const i = list.findIndex(same);
	if (i === -1) return [...list, item];
	const next = list.slice();
	next[i] = item;
	return next;
};

const count = (files: RunFile[], status: RunFile["status"]) =>
	files.filter((f) => f.status === status).length;

const applyEvent = (run: RunDetail, event: RunEvent): RunDetail => {
	switch (event.type) {
		case "status":
			return {
				...run,
				status: event.status,
				phase: event.phase,
				finishedAt:
					TERMINAL.has(event.status) && !run.finishedAt
						? new Date().toISOString()
						: run.finishedAt,
			};
		case "worker":
			return {
				...run,
				workers: upsert(
					run.workers,
					event.worker,
					(w) => w.name === event.worker.name,
				),
			};
		case "file": {
			const files = upsert(
				run.files,
				event.file,
				(f) => f.file === event.file.file,
			);
			return {
				...run,
				files,
				passed: count(files, "passed"),
				failed: count(files, "failed") + count(files, "crashed"),
			};
		}
		case "log":
			return run;
	}
};

/** Streams /runs/:id/events into the run's query cache; returns the live log tail. */
export const useRunEvents = ({ id, live }: { id: string; live: boolean }) => {
	const qc = useQueryClient();
	const [log, setLog] = useState<LogLine[]>([]);
	const [connected, setConnected] = useState(false);

	useEffect(() => {
		if (!live) return;
		setConnected(true);
		const unsubscribe = transport.subscribe({
			path: `/runs/${id}/events`,
			onMessage: (data) => {
				const parsed = RunEvent.safeParse(data);
				if (!parsed.success) return;
				const event = parsed.data;
				if (event.type === "log") {
					setLog((prev) => [...prev.slice(-(MAX_LOG_LINES - 1)), event]);
					return;
				}
				qc.setQueryData<RunDetail>(qk.run(id), (run) =>
					run ? applyEvent(run, event) : run,
				);
				if (event.type === "status" && TERMINAL.has(event.status)) {
					qc.invalidateQueries({ queryKey: qk.run(id) });
					qc.invalidateQueries({ queryKey: ["runs"] });
				}
			},
			onError: () => setConnected(false),
		});
		return () => {
			unsubscribe();
			setConnected(false);
		};
	}, [id, live, qc]);

	return { log, connected };
};
