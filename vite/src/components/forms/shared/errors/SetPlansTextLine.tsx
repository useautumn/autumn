import type { SetPlansTextPart } from "@autumn/shared";
import { Fragment } from "react";

/** A line of shared Set Plans copy (errors and warnings): names bold, everything else as-is. */
export function SetPlansTextLine({ parts }: { parts: SetPlansTextPart[] }) {
	return parts.map((part, index) => (
		<Fragment key={`${index}-${part.text}`}>
			{index > 0 && !part.attach && " "}
			{part.bold ? (
				<span className="font-semibold text-foreground">{part.text}</span>
			) : (
				part.text
			)}
		</Fragment>
	));
}
