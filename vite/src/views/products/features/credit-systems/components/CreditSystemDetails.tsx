import type { CreateFeature } from "@autumn/shared";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";

interface CreditSystemDetailsProps {
	creditSystem: CreateFeature;
	setCreditSystem: (creditSystem: CreateFeature) => void;
}

export function CreditSystemDetails({
	creditSystem,
	setCreditSystem,
}: CreditSystemDetailsProps) {
	const { setSource, setTarget } = useAutoSlug({
		setState: setCreditSystem,
		sourceKey: "name",
		targetKey: "id",
	});

	return (
		<SheetSection title="Credit Details">
			<div className="grid grid-cols-2 gap-2">
				<div>
					<FormLabel>Name</FormLabel>
					<Input
						placeholder="eg. Credit System"
						value={creditSystem.name}
						onChange={(e) => setSource(e.target.value)}
					/>
				</div>
				<div>
					<FormLabel>ID</FormLabel>
					<Input
						placeholder="fills automatically"
						value={creditSystem.id}
						onChange={(e) => setTarget(e.target.value)}
					/>
				</div>
			</div>
		</SheetSection>
	);
}
