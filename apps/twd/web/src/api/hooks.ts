import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import type { ReinitScope } from "../../../src/api/contract.ts";
import {
	ApiKey,
	Branch,
	Capacity,
	Catalog,
	Costs,
	CreateApiKeyResponse,
	type CreateRunBody,
	EnqueueResponse,
	ImportKeysResponse,
	Job,
	KeysOverview,
	Me,
	RetryBrokenAccountsResponse,
	RunDetail,
	RunSummary,
	RunsPage,
	StripeAccount,
} from "../../../src/api/contract.ts";
import { FileHistory } from "../../../src/internal/results/types/resultsSchemas.ts";
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
	costs: (q: CostsFilter) => ["costs", q] as const,
	apiKeys: ["api-keys"] as const,
};

export type CostsFilter = { from: string; bucket: "day" | "week" };

export type RunsFilter = {
	status: "live" | "finished" | "all";
	outcome?: "all" | "passed" | "failed" | "cancelled";
	purpose?: RunSummary["purpose"];
	/** Only runs that feed (true) or don't feed (false) the dev baseline. */
	baseline?: boolean;
	branch?: string;
	cursor?: string;
	limit: number;
};

const qs = (params: Record<string, string | number | boolean | undefined>) => {
	const entries = Object.entries(params).filter(
		(e): e is [string, string | number | boolean] =>
			e[1] !== undefined && e[1] !== "",
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
				path: `/runs${qs({ ...filter })}`,
				schema: RunsPage,
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

/** Fetch-on-demand log text (for copy buttons); not cached. */
export const fetchRunLogs = ({
	runId,
	failed,
	worker,
	file,
}: {
	runId: string;
	failed?: boolean;
	worker?: string;
	file?: string;
}) =>
	apiText({
		path: failed
			? `/runs/${runId}/logs/failed`
			: `/runs/${runId}/logs${qs({ worker, file })}`,
	});

export const useWorkerLog = ({
	runId,
	worker,
}: {
	runId: string;
	worker: string | null;
}) =>
	useQuery({
		queryKey: ["workerLog", runId, worker ?? ""],
		queryFn: () =>
			apiText({
				path: `/runs/${runId}/logs${qs({ worker: worker ?? undefined })}`,
			}),
		enabled: worker !== null,
	});

export const useFileHistory = ({ file }: { file: string }) =>
	useQuery({
		queryKey: ["fileHistory", file],
		queryFn: () =>
			api({
				path: `/files/history${qs({ file, limit: 200 })}`,
				schema: FileHistory,
			}),
		staleTime: 30_000,
	});

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

export const useCosts = (filter: CostsFilter) =>
	useQuery({
		queryKey: qk.costs(filter),
		queryFn: () => api({ path: `/costs${qs(filter)}`, schema: Costs }),
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});

/** Worker pricing only; rates change per deploy, not per window. */
export const useCostRates = () =>
	useQuery({
		queryKey: ["costs", "rates"],
		queryFn: () => api({ path: "/costs?bucket=week", schema: Costs }),
		select: (costs) => costs.rates,
		staleTime: Number.POSITIVE_INFINITY,
	}).data;

export const useApiKeys = () =>
	useQuery({
		queryKey: qk.apiKeys,
		queryFn: () => api({ path: "/api-keys", schema: z.array(ApiKey) }),
	});

export const useRefreshBranches = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api({
				method: "POST",
				path: "/branches/refresh",
				schema: z.array(Branch),
			}),
		onSuccess: (branches) => qc.setQueryData(qk.branches, branches),
	});
};

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

export const useImportKeys = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (text: string) =>
			api({
				method: "POST",
				path: "/keys/import",
				body: { text },
				schema: ImportKeysResponse,
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: qk.keys }),
	});
};

export const useRemoveKey = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (platformAccountId: string) =>
			api({
				method: "DELETE",
				path: `/keys/${encodeURIComponent(platformAccountId)}`,
				schema: z.object({ platformAccountId: z.string() }),
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: qk.keys }),
	});
};

export type ReinitRequest = {
	scope: ReinitScope;
	platformAccountIds?: string[];
	targetPerKey?: number;
};

export const useReinitKeys = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: ReinitRequest = { scope: "all" }) =>
			api({
				method: "POST",
				path: "/keys/reinit",
				body,
				schema: EnqueueResponse,
			}),
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

export const useRetryBrokenAccounts = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () =>
			api({
				method: "POST",
				path: "/accounts/retry-broken",
				schema: RetryBrokenAccountsResponse,
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: qk.accounts });
			qc.invalidateQueries({ queryKey: qk.capacity });
			qc.invalidateQueries({ queryKey: qk.keys });
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
