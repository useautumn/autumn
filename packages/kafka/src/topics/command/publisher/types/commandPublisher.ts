import type { KafkaSender } from "../../../../client/types/kafkaClient.js";
import type { CommandRecord } from "../../types/commandRecord.js";

export type CommandPublisherContext = {
	producer: KafkaSender;
	topic: string;
};

export type CommandAppend = {
	records: readonly { partition: number; command: CommandRecord }[];
};

export type CommandPublisher = {
	append(params: CommandAppend): Promise<void>;
};
