import CodeBlock from "../onboarding/components/CodeBlock";

const installCode = `npm install autumn-js`;
const installCodePnpm = `pnpm install autumn-js`;
const installCodeYarn = `yarn add autumn-js`;
export default function Install() {
	return (
		<div className="flex flex-col gap-2">
			<CodeBlock
				snippets={[
					{
						title: "npm",
						language: "bash",
						displayLanguage: "bash",
						content: installCode,
					},
					{
						title: "pnpm",
						language: "bash",
						displayLanguage: "bash",
						content: installCodePnpm,
					},
					{
						title: "yarn",
						language: "bash",
						displayLanguage: "bash",
						content: installCodeYarn,
					},
				]}
			/>
		</div>
	);
}
