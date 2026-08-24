/** Section label inside a PlanChangeDialog step. */
export function PlanChangeFieldLabel({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<span className="text-[13px] font-medium text-foreground">{children}</span>
	);
}
