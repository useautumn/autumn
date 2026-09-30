import type { ReactNode } from "react";

/** A compact titled block: small heading and one line of context, with an optional action on the right. */
export const RolloutSection = ({
	title,
	description,
	actions,
	children,
}: {
	title: string;
	description: string;
	actions?: ReactNode;
	children: ReactNode;
}) => (
	<section className="flex flex-col gap-3">
		<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
			<div className="flex min-w-48 flex-1 flex-col gap-0.5">
				<h2 className="text-sm font-medium text-foreground">{title}</h2>
				<p className="text-xs text-tertiary-foreground">{description}</p>
			</div>
			{actions && (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			)}
		</div>
		{children}
	</section>
);
