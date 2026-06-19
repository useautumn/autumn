import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { FormLabel as FieldLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { useSwitchActiveOrg } from "@/hooks/common/useOrg";
import { authClient } from "@/lib/auth-client";
import { slugify } from "@/utils/formatUtils/formatTextUtils";

export const CreateNewOrg = ({
	dialogType,
	setDialogType,
}: {
	dialogType: "create" | "manage" | null;
	setDialogType: (dialogType: "create" | "manage" | null) => void;
}) => {
	const navigate = useNavigate();
	const switchActiveOrg = useSwitchActiveOrg();
	const [name, setName] = useState("");
	const [slugChanged, setSlugChanged] = useState(false);
	const [slug, setSlug] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleCreate = async () => {
		setIsLoading(true);
		try {
			const { data, error } = await authClient.organization.create({
				name,
				slug,
			});

			if (error) throw error;

			await switchActiveOrg(data.id);

			toast.success("Organization created");
			setDialogType(null);
			navigate("/");
		} catch (error: any) {
			console.log(error);
			toast.error(error.message);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog
			open={!!dialogType}
			onOpenChange={(open) => {
				if (!open) setDialogType(null);
			}}
		>
			<DialogContent className="w-[400px] bg-card">
				<DialogHeader>
					<DialogTitle>Create Organization</DialogTitle>
					<DialogDescription>
						Set up a new organization workspace.
					</DialogDescription>
				</DialogHeader>
				<div className="flex gap-2">
					<div className="flex-1">
						<FieldLabel>Name</FieldLabel>
						<Input
							placeholder="Acme Inc"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								if (!slugChanged) {
									setSlug(slugify(e.target.value));
								}
							}}
						/>
					</div>
					<div className="flex-1">
						<FieldLabel>Slug</FieldLabel>
						<Input
							placeholder="acme-inc"
							value={slug}
							onChange={(e) => {
								if (!slugChanged) {
									setSlug(slugify(e.target.value));
								}
							}}
						/>
					</div>
				</div>
				<DialogFooter>
					<ShortcutButton
						variant="primary"
						onClick={handleCreate}
						isLoading={isLoading}
						metaShortcut="enter"
						className="w-full"
					>
						Create Organization
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
