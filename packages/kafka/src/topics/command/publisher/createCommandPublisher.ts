import { appendCommandRecords } from "./appendCommandRecords.js";
import type {
	CommandAppend,
	CommandPublisher,
	CommandPublisherContext,
} from "./types/commandPublisher.js";

export function createCommandPublisher({
	ctx,
}: {
	ctx: CommandPublisherContext;
}): CommandPublisher {
	function append(params: CommandAppend): Promise<void> {
		return appendCommandRecords({ ctx, ...params });
	}

	return { append };
}
