import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useRCProjects } from "@/hooks/queries/revcat/useRCProjects";
import { getBackendErr } from "@/utils/genUtils";

interface RevenueCatProjectSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	env: string;
	oauthConnected: boolean;
	value: string;
	onValueChange: (value: string) => void;
	onSave: () => void;
	isLoading: boolean;
}

export function RevenueCatProjectSheet({
	open,
	onOpenChange,
	env,
	oauthConnected,
	value,
	onValueChange,
	onSave,
	isLoading,
}: RevenueCatProjectSheetProps) {
	const label = env === "live" ? "Project" : "Sandbox Project";

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title={`Select ${label}`}
					description={
						oauthConnected
							? "Choose the RevenueCat project to sync with Autumn."
							: "Enter your RevenueCat project ID. You can find this in your RevenueCat dashboard."
					}
					noSeparator
				/>

				<div className="flex-1 overflow-y-auto px-4 pt-4">
					{oauthConnected ? (
						<ProjectSelect
							open={open}
							value={value}
							onValueChange={onValueChange}
						/>
					) : (
						<div>
							<FormLabel>
								<span className="text-muted-foreground">{`${label} ID`}</span>
							</FormLabel>
							<Input
								value={value}
								onChange={(e) => onValueChange(e.target.value)}
								placeholder="Enter project ID..."
							/>
						</div>
					)}
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={() => onOpenChange(false)}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={onSave}
						metaShortcut="enter"
						isLoading={isLoading}
						disabled={!value.trim()}
					>
						Save
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

function ProjectSelect({
	open,
	value,
	onValueChange,
}: {
	open: boolean;
	value: string;
	onValueChange: (value: string) => void;
}) {
	const { projects, isLoading, createProject, isCreating } = useRCProjects({
		enabled: open,
	});
	const [showCreate, setShowCreate] = useState(false);
	const [newName, setNewName] = useState("");

	const items = useMemo(
		() => Object.fromEntries(projects.map((p) => [p.id, p.name || p.id])),
		[projects],
	);

	const handleCreate = async () => {
		const name = newName.trim();
		if (!name) return;
		try {
			const project = await createProject(name);
			onValueChange(project.id);
			toast.success(`Created project "${project.name || project.id}"`);
			setNewName("");
			setShowCreate(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create project"));
		}
	};

	if (isLoading) {
		return <Skeleton className="h-10 w-full rounded-lg" />;
	}

	return (
		<div className="flex flex-col gap-4">
			{projects.length === 0 ? (
				<div className="text-tertiary-foreground text-sm py-1">
					No RevenueCat projects found for this account.
				</div>
			) : (
				<Select value={value} onValueChange={onValueChange} items={items}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select a project..." />
					</SelectTrigger>
					<SelectContent>
						{projects.map((project) => (
							<SelectItem key={project.id} value={project.id}>
								{project.name || project.id}
								<span className="text-tertiary-foreground text-tiny">
									{project.id}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}

			<div className="border-t border-border pt-4">
				{showCreate ? (
					<div className="flex flex-col gap-2">
						<FormLabel>
							<span className="text-muted-foreground">New project name</span>
						</FormLabel>
						<Input
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							placeholder="eg. My App"
						/>
						<div className="flex gap-2">
							<Button
								variant="secondary"
								className="flex-1"
								onClick={() => {
									setShowCreate(false);
									setNewName("");
								}}
							>
								Cancel
							</Button>
							<Button
								className="flex-1"
								onClick={handleCreate}
								isLoading={isCreating}
								disabled={!newName.trim()}
							>
								Create
							</Button>
						</div>
					</div>
				) : (
					<Button
						variant="secondary"
						className="w-full"
						onClick={() => setShowCreate(true)}
					>
						Create new project
					</Button>
				)}
			</div>
		</div>
	);
}
