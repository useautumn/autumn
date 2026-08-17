import { afterAll, mock } from "bun:test";

/**
 * `mock.module` that puts the real exports back when the file ends — bun's
 * `mock.restore()` does not revert a module registration, so a plain
 * `mock.module` rewrites that module for every later file in the same run.
 *
 * The real namespace is also spread under the fakes: a partial factory merges
 * into a module bun has already loaded but fully REPLACES one it has not, and
 * file order is filesystem-dependent.
 *
 * `specifier` is resolved against `baseUrl` (pass `import.meta.url`) so the
 * caller can keep writing paths relative to its own file.
 */
export const mockModuleWithRestore = async ({
	baseUrl,
	factory,
	specifier,
}: {
	baseUrl: string;
	factory: () => Record<string, unknown>;
	specifier: string;
}): Promise<Record<string, unknown>> => {
	const resolved = new URL(specifier, baseUrl).href;
	// Spread before mocking: a live namespace object retargets to the mock, so
	// restoring it would reinstall the mock instead of the real module.
	const real = { ...(await import(resolved)) };
	mock.module(resolved, () => ({ ...real, ...factory() }));
	afterAll(() => {
		mock.module(resolved, () => real);
	});
	return real;
};
