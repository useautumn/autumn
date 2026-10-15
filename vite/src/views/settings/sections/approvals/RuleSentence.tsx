import type { SentencePart } from "./buildRuleSentence";
import { RuleSentencePart } from "./RuleSentencePart";

export const RuleSentence = ({ parts }: { parts: SentencePart[] }) => (
	<p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
		{parts.map((part) => (
			<RuleSentencePart key={part.key} part={part} />
		))}
	</p>
);
