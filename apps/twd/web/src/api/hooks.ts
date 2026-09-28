import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import {
	ApiKey,
	Branch,
	Capacity,
	Catalog,
	CreateApiKeyResponse,
	type CreateRunBody,
	EnqueueResponse,
	Job,
	KeysOverview,
	Me,
	Reservation,
	RunDetail,
	RunSummary,
	StripeAccount,
} from "../../../src/api/contract.ts";
import { api, apiText } from "./client.ts";
import { whileDisconnected } from "./live.ts";
import type { LogLine } from "./liveCache.ts";

export const qk = {
	me: ["me"] as const,
	runs: (filter: RunsFilter) => ["runs", filter] as const,
	run: (id: string) => ["run", id] as const,
	fileLog: (id: string, file: string) => ["run", id, "log", file] as const,
	liveLog: (id: string) => ["run", id, "live-log"] as const,
	jobs: ["jobs"] as const,
	catalog: ["catalog"] as const,
	branches: ["branches"] as const,
	capacity: ["capacity"] as const,
	keys: ["keys"] as const,
	accounts: ["accounts"] as const,
	reservations: ["reservations"] as const,
	apiKeys: ["api-keys"] as const,
};

export type RunsFilter = {
	status: "live" | "finished" | "all";
	branch?: string;
};

const qs = (params: Record<string, string | number | undefined>) => {
	const entries = Object.entries(params).filter(
		(e): e is [string, string | number] => e[1] !== undefined && e[1] !== "",
	);
	return entries.length
		? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}`
		: "";
};

export const useMe = () =>
	useQuery({
		queryKey: qk.me,
		queryFn: () => api({ path: "/me", schema: Me }),
		retry: false,
		staleTime: 60_000,
	});

export const useRuns = (filter: RunsFilter) =>
	useQuery({
		queryKey: qk.runs(filter),
		queryFn: () =>
			api({
				path: `/runs${qs({ status: filter.status, branch: filter.branch, limit: 100 })}`,
				schema: z.array(RunSummary),
			}),
		refetchInterval: whileDisconnected,
		placeholderData: keepPreviousData,
	});

export const useRun = (id: string) =>
	useQuery({
		queryKey: qk.run(id),
		queryFn: () => api({ path: `/runs/${id}`, schema: RunDetail }),
		refetchInterval: whileDisconnected,
	});

/** Live log tail for a run; filled only by run.event log frames. */
export const useLiveLog = (id: string) => {
	const qc = useQueryClient();
	return (
		useQuery({
			queryKey: qk.liveLog(id),
			queryFn: () => qc.getQueryData<LogLine[]>(qk.liveLog(id)) ?? [],
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: 5 * 60_000,
		}).data ?? []
	);
};

export const useFileLog = ({
	runId,
	file,
}: {
	runId: string;
	file: string | null;
}) =>
	useQuery({
		queryKey: qk.fileLog(runId, file ?? ""),
		queryFn: () =>
			apiText({
				path: `/runs/${runId}/files/log${qs({ file: file ?? undefined })}`,
			}),
		enabled: file !== null,
	});

export const useCatalog = () =>
	useQuery({
		queryKey: qk.catalog,
		queryFn: () => api({ path: "/catalog", schema: Catalog }),
		staleTime: 5 * 60_000,
	});

export const useBranches = () =>
	useQuery({
		queryKey: qk.branches,
		queryFn: () => api({ path: "/branches", schema: z.array(Branch) }),
		refetchInterval: whileDisconnected,
	});

export const useCapacity = () =>
	useQuery({
		queryKey: qk.capacity,
		queryFn: () => api({ path: "/capacity", schema: Capacity }),
		refetchInterval: whileDisconnected,
	});

export const useKeys = () =>
	useQuery({
		queryKey: qk.keys,
		queryFn: () => api({ path: "/keys", schema: KeysOverview }),
		refetchInterval: whileDisconnected,
	});

export const useAccounts = () =>
	useQuery({
		queryKey: qk.accounts,
		queryFn: () => api({ path: "/accounts", schema: z.array(StripeAccount) }),
		refetchInterval: whileDisconnected,
	});

/** Seeded by GET /jobs, then kept current by the "jobs" live topic. */
export const useJobs = () =>
	useQuery({
		queryKey: qk.jobs,
		queryFn: async () =>
			(
				await api({
					path: "/jobs?status=all&limit=200",
					schema: z.object({ jobs: z.array(Job) }),
				})
			).jobs,
		refetchInterval: whileDisconnected,
	});

export const useReservations = () =>
	useQuery({
		queryKey: qk.reservations,
		queryFn: () => api({ path: "/reservations", schema: z.array(Reservation) }),
		refetchInterval: whileDisconnected,
	});

export const useApiKeys = () =>
	useQuery({
		queryKey: qk.apiKeys,
		queryFn: () => api({ path: "/api-keys", schema: z.array(ApiKey) }),
	});

export const useWarmBranch = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (branch: string) =>
			api({
				method: "POST",
				path: `/branches/${encodeURIComponent(branch)}/warm`,
				schema: EnqueueResponse,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: qk.branches }),
	});
};

export const useCreateRun = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: z.input<typeof CreateRunBody>) =>
			api({ method: "POST", path: "/runs", body, schema: RunSummary }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
	});
};

export const useCancelRun = (id: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api({ method: "POST", path: `/runs/${id}/cancel`, schema: RunSummary }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: qk.run(id) });
			qc.invalidateQueries({ queryKey: ["runs"] });
		},
	});
};

export const useRerunFailed = (id: string) => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api({
				method: "POST",
				path: `/runs/${id}/rerun-failed`,
				schema: RunSummary,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
	});
};

export const useProbeKeys = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api({ method: "POST", path: "/keys/probe", schema: KeysOverview }),
		onSuccess: (data) => qc.setQueryData(qk.keys, data),
	});
};

export const useReinitKeys = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api({ method: "POST", path: "/keys/reinit", schema: EnqueueResponse }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: qk.keys });
			qc.invalidateQueries({ queryKey: qk.capacity });
		},
	});
};

const upsertJob = (jobs: Job[] | undefined, job: Job) =>
	jobs ? [job, ...jobs.filter((j) => j.id !== job.id)] : [job];

export const useFullNukeKey = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			platformAccountId,
			targetPerKey,
		}: {
			platformAccountId: string;
			targetPerKey: number;
		}) =>
			api({
				method: "POST",
				path: `/keys/${encodeURIComponent(platformAccountId)}/full-nuke`,
				body: { targetPerKey },
				schema: EnqueueResponse,
			}),
		onSuccess: ({ job }) => {
			qc.setQueryData<Job[]>(qk.jobs, (jobs) => upsertJob(jobs, job));
			qc.invalidateQueries({ queryKey: qk.keys });
		},
	});
};

export const useNukeAccounts = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (accountIds: string[]) =>
			api({
				method: "POST",
				path: "/accounts/nuke",
				body: { accountIds },
				schema: z.array(EnqueueResponse),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: qk.accounts });
			qc.invalidateQueries({ queryKey: qk.capacity });
		},
	});
};

export const useForgetAccount = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			api({
				method: "DELETE",
				path: `/accounts/${encodeURIComponent(id)}`,
				schema: z.unknown(),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: qk.accounts });
			qc.invalidateQueries({ queryKey: qk.capacity });
			qc.invalidateQueries({ queryKey: qk.keys });
		},
	});
};

export const useCreateReservation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: { count: number; ttl: string; note?: string }) =>
			api({ method: "POST", path: "/reservations", body, schema: Reservation }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: qk.reservations });
			qc.invalidateQueries({ queryKey: qk.capacity });
		},
	});
};

export const useReleaseReservation = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			api({
				method: "DELETE",
				path: `/reservations/${id}`,
				schema: z.unknown(),
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: qk.reservations });
			qc.invalidateQueries({ queryKey: qk.capacity });
		},
	});
};

export const useCreateApiKey = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (name: string) =>
			api({
				method: "POST",
				path: "/api-keys",
				body: { name },
				schema: CreateApiKeyResponse,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys }),
	});
};

export const useRevokeApiKey = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			api({ method: "DELETE", path: `/api-keys/${id}`, schema: z.unknown() }),
		onSuccess: () => qc.invalidateQueries({ queryKey: qk.apiKeys }),
	});
};

export const useLogout = () =>
	useMutation({
		mutationFn: () =>
			api({ method: "POST", path: "/auth/logout", schema: z.unknown() }),
		onSuccess: () => window.location.assign("/sign-in"),
	});
