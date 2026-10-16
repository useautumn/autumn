import type { ReactNode } from "react";

/** A labelled editor field: "Who  Everyone, roles or members", then the input and its error. */
export const RuleField = ({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: ReactNode;
}) => (
	<div className="flex flex-col gap-2">
		<div className="flex items-baseline gap-2 text-sm">
			<span className="font-medium text-foreground">{label}</span>
			{hint && <span className="text-subtle text-xs">{hint}</span>}
		</div>
		{children}
		{error && <p className="text-destructive text-xs">{error}</p>}
	</div>
);
