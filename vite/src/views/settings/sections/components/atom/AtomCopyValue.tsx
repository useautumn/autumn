import { CopyIconButton } from "@autumn/ui";

/** A value as plain monospace text, with its copy icon right after it. */
export const AtomCopyValue = ({ text }: { text: string }) => (
	<span className="flex min-w-0 items-center gap-0.5">
		<span className="truncate font-mono text-xs text-foreground" title={text}>
			{text}
		</span>
		<CopyIconButton
			text={text}
			size="sm"
			className="size-6! shrink-0 justify-center text-subtle"
		/>
	</span>
);
