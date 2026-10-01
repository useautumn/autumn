type Interval = { startsAt: number; endsAt: number | null };

export const isAliveAt = ({ segment, at }: { segment: Interval; at: number }) =>
	segment.startsAt <= at && (segment.endsAt === null || segment.endsAt > at);

export const isAliveJustBefore = ({
	segment,
	at,
}: {
	segment: Interval;
	at: number;
}) =>
	segment.startsAt < at && (segment.endsAt === null || segment.endsAt >= at);

export const startsInFuture = ({
	segment,
	now,
}: {
	segment: Interval;
	now: number;
}) => segment.startsAt > now;

export const earliestEnd = (endsAts: (number | null)[]): number | null => {
	const finite = endsAts.filter((endsAt): endsAt is number => endsAt !== null);
	return finite.length > 0 ? Math.min(...finite) : null;
};

export const groupByKey = <Item extends { key: string }>(items: Item[]) => {
	const groups = new Map<string, Item[]>();
	for (const item of items) {
		groups.set(item.key, [...(groups.get(item.key) ?? []), item]);
	}
	return groups;
};

export const sortByStart = <Item extends Interval>(items: Item[]) =>
	[...items].sort((first, second) => first.startsAt - second.startsAt);
