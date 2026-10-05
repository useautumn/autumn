export type PartitionBookmark = {
	topic: string;
	partition: number;
	nextOffset: bigint;
	commandNextOffset: bigint | null;
};

/** Parses `kafka-get-offsets.sh` output (`topic:partition:offset` per line) into log end offsets. */
export function parseLogEndOffsets({
	output,
}: {
	output: string;
}): Map<string, bigint> {
	const ends = new Map<string, bigint>();
	for (const line of output.split("\n")) {
		const match = /^(.+):(\d+):(\d+)$/.exec(line.trim());
		if (match) ends.set(`${match[1]}:${match[2]}`, BigInt(match[3]));
	}
	return ends;
}

const commandsTopicFor = ({ topic }: { topic: string }) =>
	topic.replace(/-events$/, "-commands");

// A missing local partition will be recreated empty; other topics aren't this broker's to judge.
const logEndFor = ({
	logEnds,
	topic,
	partition,
}: {
	logEnds: Map<string, bigint>;
	topic: string;
	partition: number;
}): bigint | undefined =>
	logEnds.get(`${topic}:${partition}`) ??
	(topic.startsWith("local-") ? 0n : undefined);

const isAheadOf = ({ offset, end }: { offset: bigint | null; end?: bigint }) =>
	offset !== null && end !== undefined && offset > end;

/** Bookmarks past their topic's log end: the broker lost records the bookmark already passed. */
export function findStaleBookmarks({
	bookmarks,
	logEnds,
}: {
	bookmarks: PartitionBookmark[];
	logEnds: Map<string, bigint>;
}): PartitionBookmark[] {
	return bookmarks.filter(
		(bookmark) =>
			isAheadOf({
				offset: bookmark.nextOffset,
				end: logEndFor({ logEnds, ...bookmark }),
			}) ||
			isAheadOf({
				offset: bookmark.commandNextOffset,
				end: logEndFor({
					logEnds,
					topic: commandsTopicFor(bookmark),
					partition: bookmark.partition,
				}),
			}),
	);
}
