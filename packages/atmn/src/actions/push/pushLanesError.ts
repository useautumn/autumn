/** One lane of a push that failed: settings, catalog or webhooks. */
export type LaneFailure = { lane: string; error: unknown };

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/** Every failing lane at once: fixing one and re-running to meet the next is the cost this avoids. */
export class PushLanesError extends Error {
	readonly failures: LaneFailure[];

	constructor({
		stage,
		failures,
	}: {
		stage: "preview" | "apply";
		failures: LaneFailure[];
	}) {
		super(
			[
				`push ${stage} failed in ${failures.length} of its lanes:`,
				...failures.map(
					({ lane, error }) =>
						`\n  ${lane}\n    ${messageOf(error).replace(/\n/g, "\n    ")}`,
				),
			].join("\n"),
		);
		this.name = "PushLanesError";
		this.failures = failures;
	}
}

/** The settled lanes' values; a rejected lane becomes a failure instead. */
export const settleLanes = async <T extends Record<string, unknown>>(
	lanes: { [K in keyof T]: Promise<T[K]> },
): Promise<{ values: Partial<T>; failures: LaneFailure[] }> => {
	const names = Object.keys(lanes) as (keyof T & string)[];
	const settled = await Promise.allSettled(names.map((name) => lanes[name]));
	const values: Partial<T> = {};
	const failures: LaneFailure[] = [];
	settled.forEach((result, index) => {
		const lane = names[index] as keyof T & string;
		if (result.status === "fulfilled")
			values[lane] = result.value as T[typeof lane];
		else failures.push({ lane, error: result.reason });
	});
	return { values, failures };
};
