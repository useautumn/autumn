import CodeBlock from "../onboarding/components/CodeBlock";

const envCode = `AUTUMN_SECRET_KEY=am_sk_1234567890`;

export default function EnvStep() {
	return (
		<div className="flex flex-col gap-2">
			<CodeBlock
				snippets={[
					{
						title: ".env",
						language: "bash",
						displayLanguage: "bash",
						content: envCode,
					},
				]}
			/>
		</div>
	);
}
