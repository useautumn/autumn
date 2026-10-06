import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
	CopyIconButton,
} from "@autumn/ui";
import { CaretDownIcon } from "@phosphor-icons/react";
import type { RunErrorView } from "../rowView/statusView";

export function RunErrorNotice({ error }: { error: RunErrorView }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-[13px] leading-[18px] font-medium text-foreground">
				{error.message}
			</span>
			{error.details && (
				<Collapsible>
					<CollapsibleTrigger className="group inline-flex items-center gap-0.5 text-tertiary-foreground hover:text-foreground">
						Technical details
						<CaretDownIcon
							className="size-3 -rotate-90 transition-transform group-data-[panel-open]:rotate-0"
							weight="bold"
						/>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="mt-1.5 flex items-start gap-1 rounded-md bg-muted/50 p-2">
							<code className="min-w-0 flex-1 font-mono text-[11px] leading-4 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
								{error.details}
							</code>
							<CopyIconButton
								text={error.details}
								side="top"
								aria-label="Copy technical details"
								className="shrink-0"
							/>
						</div>
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	);
}
