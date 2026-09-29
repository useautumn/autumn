import { PLAN_SECTION_HEADER_CLASS } from "./PlanSection";

export function PlanTraySectionTitle({
	title,
	hint,
}: {
	title: string;
	hint?: string;
}) {
	return (
		<div className={PLAN_SECTION_HEADER_CLASS}>
			<span className="font-medium text-muted-foreground">{title}</span>
			{hint && (
				<span className="truncate text-tertiary-foreground">{hint}</span>
			)}
		</div>
	);
}
