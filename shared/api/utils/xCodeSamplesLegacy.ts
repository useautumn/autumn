/**
 * Generates x-codeSamples for OpenAPI specs (legacy format).
 * @param methodPath - The SDK method path (e.g., "balances.create")
 * @param example - The example params object
 */
export const xCodeSamplesLegacy = ({
	methodPath,
	example,
}: {
	methodPath: string;
	example: Record<string, unknown>;
}) => {
	const exampleStr = JSON.stringify(example, null, 2);

	return [
		{
			lang: "JavaScript",
			source: `import { Autumn } from 'autumn-js';
					
const autumn = new Autumn();

const { data, error } = await autumn.${methodPath}(${exampleStr});
`,
		},
	];
};
