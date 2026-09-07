import type { PartitionCheckpointExportResult } from "../partitionCheckpointExporter.js";
import type { CheckpointThreadFailure } from "./checkpointThreadFailure.js";

export type CheckpointThreadRequest =
	| {
			kind: "export";
			id: number;
			topic: string;
			partition: number;
			consumedNextOffset: bigint | null;
			cancelled: SharedArrayBuffer;
	  }
	| { kind: "cancel"; id: number };

export type CheckpointThreadResponse =
	| { kind: "exported"; id: number; result: PartitionCheckpointExportResult }
	| { kind: "failed"; id: number; failure: CheckpointThreadFailure };
