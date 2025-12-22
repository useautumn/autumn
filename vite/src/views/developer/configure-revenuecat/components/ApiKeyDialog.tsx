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

interface ApiKeyDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	env: string;
	currentApiKey?: string;
	apiKeyInput: string;
	onApiKeyInputChange: (value: string) => void;
	onSave: () => void;
	isLoading: boolean;
}

export const ApiKeyDialog = ({
	open,
	onOpenChange,
	env,
	currentApiKey,
	apiKeyInput,
	onApiKeyInputChange,
	onSave,
	isLoading,
}: ApiKeyDialogProps) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{currentApiKey ? "Update" : "Add"}{" "}
						{env === "live" ? "API Key" : "Sandbox API Key"}
					</DialogTitle>
					<DialogDescription>
						Enter your RevenueCat {env === "live" ? "" : "sandbox "}API key. You
						can find this in your RevenueCat dashboard.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div>
						<FormLabel>
							<span className="text-t2">
								{env === "live" ? "API Key" : "Sandbox API Key"}
							</span>
						</FormLabel>
						<Input
							value={apiKeyInput}
							onChange={(e) => onApiKeyInputChange(e.target.value)}
							placeholder="sk_..."
						/>
					</div>
					<div className="flex gap-2 justify-end">
						<Button
							variant="secondary"
							onClick={() => {
								onOpenChange(false);
								onApiKeyInputChange("");
							}}
						>
							Cancel
						</Button>
						<Button
							onClick={onSave}
							isLoading={isLoading}
							disabled={!apiKeyInput.trim()}
						>
							Save
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
