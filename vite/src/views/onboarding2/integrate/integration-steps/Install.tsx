import CodeBlock from "@/views/onboarding/components/CodeBlock";
import { StepHeader } from "../StepHeader";

const installCode = `npm install autumn-js`;
const installCodePnpm = `pnpm add autumn-js`;
const installCodeYarn = `yarn add autumn-js`;
const installCodeBun = `bun add autumn-js`;

export const Install = () => {
	return (
		<div className="flex flex-col gap-2 w-full">
			<StepHeader number={3} title="Install autumn-js" />

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
					{
						title: "bun",
						language: "bash",
						displayLanguage: "bash",
						content: installCodeBun,
					},
				]}
			/>
		</div>
	);
};
