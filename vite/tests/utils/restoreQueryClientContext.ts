import { mock } from "bun:test";
import { useContext } from "react";

/** Other suites stub `useQueryClient` for the whole bun run; read the rendered provider again. */
export const restoreQueryClientContext = async () => {
	const actual = await import("@tanstack/react-query");
	mock.module("@tanstack/react-query", () => ({
		...actual,
		useQueryClient: (client?: InstanceType<typeof actual.QueryClient>) => {
			const resolved = client ?? useContext(actual.QueryClientContext);
			if (!resolved) throw new Error("No QueryClient set");
			return resolved;
		},
	}));
};
