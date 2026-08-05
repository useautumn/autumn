import { afterAll, mock } from "bun:test";

/**
 * `mock.module` with cross-file hygiene for single-process unit runs:
 *
 * - Pre-imports the real module and spreads it under the factory's exports,
 *   so omitted exports never break later files. (A partial factory MERGES
 *   into a module already in bun's registry but fully REPLACES one that is
 *   not — and file execution order is filesystem-dependent, so which case
 *   you get differs between macOS and CI.)
 * - Restores the real exports in `afterAll`, so mocked behavior cannot leak
 *   into files that run later in the same process.
 *
 * The snapshot is spread out of the namespace BEFORE mocking — a live
 * namespace object retargets to the mock, which would make the restore
 * reinstall the mock instead of the real module.
 */
export const mockModuleWithRestore = async (
	specifier: string,
	factory: () => Record<string, unknown>,
): Promise<Record<string, unknown>> => {
	const real = { ...(await import(specifier)) };
	mock.module(specifier, () => ({ ...real, ...factory() }));
	afterAll(() => {
		mock.module(specifier, () => real);
	});
	return real;
};
