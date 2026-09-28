/** Svix reads a missing filter as "every event" and rejects an empty one, so
 * `[]` is sent as null; an omitted list stays omitted and leaves it unchanged. */
export const toSvixFilterTypes = ({
	events,
}: {
	events: string[] | undefined;
}): string[] | null | undefined => {
	if (events === undefined) return undefined;
	return events.length > 0 ? events : null;
};
