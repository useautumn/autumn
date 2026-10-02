import { CopyButton } from "@autumn/ui";

/** A value the server hands out once; it is gone on the next reload. */
export const ShadowAtomSecret = ({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint: string;
}) => (
	<div className="flex flex-col gap-1 rounded-md border border-dashed border-yellow-500/50 bg-yellow-500/5 px-3 py-2">
		<span className="text-xs font-medium text-foreground">{label}</span>
		<CopyButton text={value} className="max-w-full font-mono text-xs" />
		<span className="text-tiny text-tertiary-foreground">{hint}</span>
	</div>
);
