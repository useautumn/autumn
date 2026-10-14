import { afterAll, mock } from "bun:test";

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
	const real = { ...(await import(resolved)) };
	mock.module(resolved, () => ({ ...real, ...factory() }));
	afterAll(() => {
		mock.module(resolved, () => real);
	});
	return real;
};
