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
		<div className="flex items-end justify-between gap-4">
			<div className="flex flex-col gap-0.5">
				<h2 className="text-sm font-medium text-foreground">{title}</h2>
				<p className="text-xs text-tertiary-foreground">{description}</p>
			</div>
			{actions}
		</div>
		{children}
	</section>
);
