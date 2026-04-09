import { PlanSectionTitle } from "@/components/forms/shared/PlanSectionTitle";

export function SectionTitle({
	hasCustomizations,
}: {
	hasCustomizations: boolean;
}) {
	return <PlanSectionTitle hasCustomizations={hasCustomizations} />;
}
