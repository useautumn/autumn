import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { RunScopeItem } from "../run/types/runScope.js";
import type { RetryableMigrationItemRunStatus } from "../run/utils/retryItemStatuses.js";

export type MigrationRunControls = {
	concurrency?: number;
	limit?: number | null;
	only?: string[] | null;
	checkpoint?: boolean;
	checkpointDryRun?: boolean;
	retryItemStatuses?: RetryableMigrationItemRunStatus[];
};

export type MigrationBatchResult<Row extends Record<string, unknown>> = {
	processed: number;
	skipped: number;
	errors: number;
	duration: number;
	rows: Row[];
	errorDetails: Array<{ item: unknown; error: Error }>;
};

export type MigrationScriptContext = Omit<AutumnContext, "logger"> & {
	logger: AutumnContext["logger"] & {
		set: (data: Record<string, unknown>) => void;
	};
};

export type MigrationBatchFn = <
	R extends Record<string, unknown> = Record<string, unknown>,
	Row extends Record<string, unknown> = R,
>(opts: {
	id?: string;
	source?: AsyncIterable<RunScopeItem>;
	fn: (args: {
		item: RunScopeItem;
		ctx: MigrationScriptContext;
	}) => Promise<R | null | undefined>;
	onResult?: (args: {
		result: R;
		item: RunScopeItem;
		ctx: MigrationScriptContext;
	}) => Row | null | undefined;
	concurrency?: number;
	limit?: number | null;
	only?: string[] | null;
	itemKey?: (item: RunScopeItem) => string;
	checkpoint?: boolean;
	checkpointDryRun?: boolean;
	logItemResult?: boolean;
	onError?: "continue" | "throw";
}) => Promise<MigrationBatchResult<Row>>;
