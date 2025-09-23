import { Button } from "@/components/v2/buttons/Button";
import { useProductContext } from "../../product/ProductContext";

export const SaveChangesBar = () => {
	const { hasChanges } = useProductContext();
	// if (!hasChanges) return null;

	const handleSave = () => {
		// TODO: Implement save functionality
		console.log("Save changes");
	};

	const handleDiscard = () => {
		// TODO: Implement discard functionality
		console.log("Discard changes");
	};

	return (
		<div className="w-full flex justify-center items-center h-20 mb-10">
			<div className="flex items-center gap-2 p-2 pl-3 rounded-xl border border-input bg-white">
				<p className="text-body">You have unsaved changes</p>
				<Button variant="secondary" onClick={handleSave}>
					Discard
				</Button>
				<Button variant="primary" onClick={handleSave}>
					Save
				</Button>
			</div>
		</div>
	);
};
