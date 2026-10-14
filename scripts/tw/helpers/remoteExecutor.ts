import { getTestExecutionArgs } from "../../testScripts/testExecutionArgs";
import {
	type TestExecutor,
	WorkerDeathError,
} from "../../testScripts/testExecutor.ts";
import {
	appendFileOutput,
	setFileWorker,
	setWorkerStatus,
} from "../dashboard/hub.ts";
import type { WorkerHandle } from "../types.ts";
import {
	createFileStatsReader,
	type FileStats,
	fileStatsWrapperSource,
} from "./fileStats.ts";
import type { WorkerPool } from "./pool.ts";
import type { ProviderSandbox } from "./provider.ts";
import { runStreaming } from "./provider.ts";

export type SandboxResolver = (
	worker: WorkerHandle,
) => ProviderSandbox | undefined;

export type RemoteExecutorOptions = {
	pool: WorkerPool;
	resolveSandbox: SandboxResolver;
	toWorkerPath?: (localFile: string) => string;
	onFileStats?: (event: {
		file: string;
		worker: string;
		stats: FileStats;
	}) => void;
};

const TEST_ENV_PREFIX = ["env", "TEST_FILE_CONCURRENCY=4"];

export const buildTestArgv = (
	file: string,
	failedTestNames?: string[],
): string[] => {
	const argv = [...TEST_ENV_PREFIX, "bun", "test", ...getTestExecutionArgs()];
	if (failedTestNames && failedTestNames.length > 0) {
		argv.push("--test-name-pattern", joinTestNamePattern(failedTestNames));
	}
	argv.push(file);
	return argv;
};

export const withFileStatsWrapper = ({
	argv,
	fileTag,
}: {
	argv: string[];
	fileTag: string;
}): string[] => [
	...TEST_ENV_PREFIX,
	`TW_TEST_FILE=${fileTag}`,
	"bun",
	"-e",
	fileStatsWrapperSource(),
	...argv.slice(TEST_ENV_PREFIX.length),
];

const joinTestNamePattern = (names: string[]): string =>
	names.map((name) => toTestNameRegex(name)).join("|");

// Bun matches --test-name-pattern against SPACE-joined describe>test labels,
const toTestNameRegex = (name: string): string =>
	name
		.split(" > ")
		.map((segment) => escapeRegex(segment))
		.join(" ");

const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;
const escapeRegex = (value: string): string =>
	value.replace(REGEX_SPECIAL_CHARS, "\\$&");

export class RemoteExecutor implements TestExecutor {
	private readonly pool: WorkerPool;
	private readonly resolveSandbox: SandboxResolver;
	private readonly toWorkerPath: (localFile: string) => string;
	private readonly onFileStats: RemoteExecutorOptions["onFileStats"];

	private readonly lastWorkerByFile = new Map<string, string>();

	constructor(opts: RemoteExecutorOptions) {
		this.pool = opts.pool;
		this.resolveSandbox = opts.resolveSandbox;
		this.toWorkerPath = opts.toWorkerPath ?? ((file) => file);
		this.onFileStats = opts.onFileStats;
	}

	async run(args: {
		file: string;
		failedTestNames?: string[];
		onChunk: (text: string) => void;
		signal?: AbortSignal;
	}): Promise<{ exitCode: number; stderr: string }> {
		const lastWorker = this.lastWorkerByFile.get(args.file);
		const isRerun = lastWorker !== undefined;

		const isWorkerDeathReschedule =
			isRerun && args.failedTestNames === undefined;

		const worker = isRerun
			? await this.pool.acquireDifferentFrom(
					lastWorker,
					isWorkerDeathReschedule,
					this.pool.slots > 1,
				)
			: await this.pool.acquire();

		worker.lastFile = args.file;
		this.lastWorkerByFile.set(args.file, worker.name);
		setFileWorker(args.file, worker.name);

		try {
			const sandbox = this.resolveSandbox(worker);
			if (!sandbox) {
				throw new WorkerDeathError({
					file: args.file,
					workerName: worker.name,
				});
			}

			const testArgv = buildTestArgv(
				this.toWorkerPath(args.file),
				args.failedTestNames,
			);
			const onFileStats = this.onFileStats;
			const statsReader = onFileStats
				? createFileStatsReader({
						onStats: (stats) =>
							onFileStats({ file: args.file, worker: worker.name, stats }),
					})
				: undefined;
			const argv = statsReader
				? withFileStatsWrapper({
						argv: testArgv,
						fileTag: crypto.randomUUID(),
					})
				: testArgv;

			const tee = (text: string): void => {
				appendFileOutput(args.file, text);
				statsReader?.push(text);
				args.onChunk(text);
			};
			const { exitCode, stderr } = await runStreaming(sandbox, argv, tee, {
				signal: args.signal,
			});
			statsReader?.flush();
			this.pool.release(worker);
			return { exitCode, stderr };
		} catch (error) {
			if (args.signal?.aborted) {
				this.pool.release(worker);
				throw error;
			}
			const deathError =
				error instanceof WorkerDeathError
					? error
					: new WorkerDeathError({
							file: args.file,
							workerName: worker.name,
							cause: error,
						});
			this.pool.markDead(worker);
			setWorkerStatus(worker.name, "dead");
			throw deathError;
		}
	}
}
