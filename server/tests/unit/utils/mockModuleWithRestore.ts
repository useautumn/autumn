import { afterAll, mock } from "bun:test";

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
