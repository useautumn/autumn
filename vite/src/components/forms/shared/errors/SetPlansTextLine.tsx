import type { SetPlansTextPart } from "@autumn/shared";
import { Fragment } from "react";

const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/** Bold keeps to the name or date itself; a sentence's trailing punctuation stays in the body text. */
const BoldText = ({ text }: { text: string }) => {
	const punctuation = text.match(TRAILING_PUNCTUATION)?.[0] ?? "";
	return (
		<>
			<span className="font-semibold text-foreground">
				{text.slice(0, text.length - punctuation.length)}
			</span>
			{punctuation}
		</>
	);
};

/** A line of shared Set Plans copy (errors and warnings): names bold, everything else as-is. */
export function SetPlansTextLine({ parts }: { parts: SetPlansTextPart[] }) {
	return parts.map((part, index) => (
		<Fragment key={`${index}-${part.text}`}>
			{index > 0 && " "}
			{part.bold ? <BoldText text={part.text} /> : part.text}
		</Fragment>
	));
}
