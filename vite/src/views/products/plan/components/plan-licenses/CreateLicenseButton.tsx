import { Button } from "@autumn/ui";
import { useState } from "react";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useIsLicenseEditor } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { CreateLicenseSheet } from "./CreateLicenseSheet";

/** "Create License" affordance next to Link License in the inline editor. */
export function CreateLicenseButton() {
	const isLicense = useIsLicenseEditor();
	const [open, setOpen] = useState(false);

	if (isLicense) return null;

	return (
		<>
			<Button
				variant="dotted"
				className="w-full max-w-xl !h-9 !rounded-xl !bg-transparent !border-dashed text-tertiary-foreground hover:text-foreground"
				onClick={() => setOpen(true)}
			>
				<LicenseIcon size={12} />
				Create License
			</Button>
			<CreateLicenseSheet open={open} onOpenChange={setOpen} />
		</>
	);
}
