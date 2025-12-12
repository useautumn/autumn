import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";

interface ProjectIdDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	env: string;
	currentProjectId?: string;
	projectIdInput: string;
	onProjectIdInputChange: (value: string) => void;
	onSave: () => void;
	isLoading: boolean;
}

export const ProjectIdDialog = ({
	open,
	onOpenChange,
	env,
	currentProjectId,
	projectIdInput,
	onProjectIdInputChange,
	onSave,
	isLoading,
}: ProjectIdDialogProps) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{currentProjectId ? "Update" : "Add"}{" "}
						{env === "live" ? "Project ID" : "Sandbox Project ID"}
					</DialogTitle>
					<DialogDescription>
						Enter your RevenueCat {env === "live" ? "" : "sandbox "}project ID.
						You can find this in your RevenueCat dashboard.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div>
						<FormLabel>
							<span className="text-t2">
								{env === "live" ? "Project ID" : "Sandbox Project ID"}
							</span>
						</FormLabel>
						<Input
							value={projectIdInput}
							onChange={(e) => onProjectIdInputChange(e.target.value)}
							placeholder="Enter project ID..."
						/>
					</div>
					<div className="flex gap-2 justify-end">
						<Button
							variant="secondary"
							onClick={() => {
								onOpenChange(false);
								onProjectIdInputChange("");
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={onSave}
							isLoading={isLoading}
							disabled={!projectIdInput.trim()}
						>
							Save
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
