import {
	getPlayHistory,
	parseEventBody,
	type SvixPlayEvent,
} from "../../../utils/svixWebhookTestUtils.js";

export const latestPlayIterator = async ({ token }: { token: string }) =>
	(await getPlayHistory({ token })).iterator;

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
		events.push(...unseen);
		if (unseen.length === 0 || !page.iterator || page.iterator === cursor)
			break;
		cursor = page.iterator;
	}
	return events.map((event) => parseEventBody<T>(event));
};
