import {
	getPlayHistory,
	parseEventBody,
	type SvixPlayEvent,
} from "../../../utils/svixWebhookTestUtils.js";

/** The newest Play event id: history requested with it returns only later events. */
export const latestPlayIterator = async ({ token }: { token: string }) =>
	(await getPlayHistory({ token })).iterator;

/** Every Play event received after `iterator`, paging forward until history is exhausted. */
export const playEventsSince = async <T>({
	token,
	iterator,
}: {
	token: string;
	iterator: string;
}): Promise<T[]> => {
	const events: SvixPlayEvent[] = [];
	let cursor = iterator;
	while (true) {
		const page = await getPlayHistory({ token, iterator: cursor || undefined });
		const unseen = page.data.filter(
			(event) => !events.some((seen) => seen.id === event.id),
		);
		if (unseen.length === 0 || !page.iterator || page.iterator === cursor)
			break;
		events.push(...unseen);
		cursor = page.iterator;
	}
	return events.map((event) => parseEventBody<T>(event));
};
