import { ArrowUpRightFromSquare } from "lucide-react";
import { CodeDisplay } from "@/components/general/CodeDisplay";
import Step from "@/components/general/OnboardingStep";
import CodeBlock from "../components/CodeBlock";

const installCode = `npm install autumn-js`;
const installCodePnpm = `pnpm install autumn-js`;
const installCodeYarn = `yarn add autumn-js`;
export default function CheckAccessStep({ number }: { number: number }) {
	return (
		<Step
			title="Install the Autumn SDK"
			number={number}
			description={
				<>
					<span>Install the Autumn SDK to your project.</span>
				</>
			}
		>
			{/* <h2 className="text-t2 font-medium text-md">Check Feature Access</h2> */}
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
		</Step>
	);
}
