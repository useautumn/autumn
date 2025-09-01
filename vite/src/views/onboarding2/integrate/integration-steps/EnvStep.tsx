import { useState } from "react";
import CodeBlock from "@/views/onboarding/components/CodeBlock";
import { CodeSpan } from "../components/CodeSpan";
import { StepHeader } from "../StepHeader";
import { CreateSecretKey } from "./CreateSecretKey";

export const EnvStep = () => {
	const [apiKey, setApiKey] = useState("");
	return (
		<div className="flex flex-col gap-4 w-full">
			<StepHeader
				number={3}
				title={
					<p>
						Add the Autumn secret key to your <CodeSpan>{".env"}</CodeSpan> file
					</p>
				}
			/>
			<CreateSecretKey apiKey={apiKey} setApiKey={setApiKey} />

			<CodeBlock
				snippets={[
					{
						title: ".env",
						language: "bash",
						displayLanguage: "bash",
						content: `AUTUMN_SECRET_KEY=${apiKey || "am_sk_12345"}`,
					},
				]}
			/>
		</div>
	);
};
