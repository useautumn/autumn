type GatedResult<T> =
	| { status: "current"; value: T }
	| { status: "failed"; error: unknown }
	| { status: "stale" };

/** Hands out a token per request; any edit, reset or close makes earlier requests stale. */
export const createRequestGate = () => {
	let current = 0;

	const invalidate = () => {
		current += 1;
	};

	const run = async <T>(request: () => Promise<T>): Promise<GatedResult<T>> => {
		current += 1;
		const token = current;
		try {
			const value = await request();
			return token === current
				? { status: "current", value }
				: { status: "stale" };
		} catch (error) {
			return token === current
				? { status: "failed", error }
				: { status: "stale" };
		}
	};

	return { invalidate, run };
};
