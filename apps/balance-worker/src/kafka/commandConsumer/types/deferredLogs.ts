import type { DeferredLogSink } from "../../../processor/types/deferredLogSink.js";

export type DeferredLogs = DeferredLogSink & {
	waitForRoom(): Promise<void>;
	settle(): Promise<void>;
};
