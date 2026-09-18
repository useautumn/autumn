const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * The plan ids a pull writes: every catalog row's own id, and the variants
 * nested under it, which are plans in their own right. Archived rows are
 * server history and never written, so they do not count.
 */
export const pulledPlanIds = ({
	plans,
}: {
	plans: Record<string, unknown>[];
}): Set<string> => {
	const ids = new Set<string>();
	for (const row of plans) {
		if (row.archived === true) continue;
		if (typeof row.id === "string") ids.add(row.id);
		if (!Array.isArray(row.variants)) continue;
		for (const edge of row.variants) {
			if (isRecord(edge) && typeof edge.variantPlanId === "string")
				ids.add(edge.variantPlanId);
		}
	}
	return ids;
};

const prunePlanIds = ({
	body,
	pulled,
}: {
	body: Record<string, unknown>;
	pulled: Set<string>;
}): { body: Record<string, unknown>; dropped: string[] } => {
	if (!Array.isArray(body.planIds)) return { body, dropped: [] };
	const dropped = body.planIds.filter(
		(id): id is string => typeof id === "string" && !pulled.has(id),
	);
	if (dropped.length === 0) return { body, dropped };
	return {
		body: {
			...body,
			planIds: body.planIds.filter((id) => !dropped.includes(id)),
		},
		dropped,
	};
};

const show = (value: string): string => JSON.stringify(value);

/**
 * A coupon or a referral program may still name a plan the pull never writes:
 * an archived one, which the server keeps for its customers but no longer
 * surfaces. The lint refuses a reference to a plan the config does not
 * declare, so a pulled config would be refused by its own push. The reference
 * is dropped instead, and said, since the next push takes it off the server
 * too — a change the preview shows before it is made.
 */
export const pruneUnpulledPlanIds = ({
	rows,
	pulled,
	kind,
}: {
	rows: Record<string, unknown>[];
	pulled: Set<string>;
	/** Rewards are union rows, `{ coupon }` or `{ featureGrant }`; referral programs are flat. */
	kind: "rewards" | "referralPrograms";
}): { rows: Record<string, unknown>[]; lines: string[] } => {
	const lines: string[] = [];
	const say = ({
		label,
		id,
		dropped,
	}: {
		label: string;
		id: unknown;
		dropped: string[];
	}): void => {
		const plans = dropped.length === 1 ? "plan" : "plans";
		lines.push(
			`↳ ${label} ${show(String(id))} no longer names ${plans} ${dropped.map(show).join(", ")}: not in the catalog (archived), so not in the config`,
		);
	};
	return {
		lines,
		rows: rows.map((row) => {
			if (kind === "referralPrograms") {
				const { body, dropped } = prunePlanIds({ body: row, pulled });
				if (dropped.length > 0)
					say({ label: "referral program", id: row.id, dropped });
				return body;
			}
			if (!isRecord(row.coupon)) return row;
			const { body, dropped } = prunePlanIds({ body: row.coupon, pulled });
			if (dropped.length === 0) return row;
			say({ label: "coupon", id: row.coupon.id, dropped });
			return { ...row, coupon: body };
		}),
	};
};
