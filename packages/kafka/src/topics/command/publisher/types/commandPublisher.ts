import type { KafkaSender } from "../../../../client/types/kafkaClient.js";
import type { CommandRecord } from "../../types/commandRecord.js";

export type CommandPublisherContext = {
	producer: KafkaSender;
	topic: string;
};

/** The caller names each command's partition: it is the routing decision, made where routing lives. */
export type CommandAppend = {
	records: readonly { partition: number; command: CommandRecord }[];
};

export type CommandPublisher = {
	/** One request for the whole batch, however many partitions it spans. */
	append(params: CommandAppend): Promise<void>;
};
