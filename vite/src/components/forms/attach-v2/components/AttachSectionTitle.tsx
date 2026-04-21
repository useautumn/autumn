import { PlanSectionTitle } from "@/components/forms/shared/PlanSectionTitle";
import { useAttachFormContext } from "../context/AttachFormProvider";

export function AttachSectionTitle() {
	const { hasCustomizations } = useAttachFormContext();

	return <PlanSectionTitle hasCustomizations={hasCustomizations} />;
}
