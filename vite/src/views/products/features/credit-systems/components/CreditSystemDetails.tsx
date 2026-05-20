import { useStore } from "@tanstack/react-form";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import type { CreditSystemFormInstance } from "../hooks/useCreditSystemForm";

interface CreditSystemDetailsProps {
	form: CreditSystemFormInstance;
}

export function CreditSystemDetails({ form }: CreditSystemDetailsProps) {
	const name = useStore(form.store, (s) => s.values.name);
	const id = useStore(form.store, (s) => s.values.id);

	return (
		<SheetSection title="Credit Details">
			<div className="grid grid-cols-2 gap-2">
				<div>
					<FormLabel>Name</FormLabel>
					<Input
						placeholder="eg. Credit System"
						value={name}
						onChange={(e) => {
							form.setFieldValue("name", e.target.value);
							if (!id || id === slugify(name)) {
								form.setFieldValue("id", slugify(e.target.value));
							}
						}}
					/>
				</div>
				<div>
					<FormLabel>ID</FormLabel>
					<Input
						placeholder="fills automatically"
						value={id}
						onChange={(e) => form.setFieldValue("id", e.target.value)}
					/>
				</div>
			</div>
		</SheetSection>
	);
}
