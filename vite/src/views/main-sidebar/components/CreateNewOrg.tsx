import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient } from "@/lib/auth-client";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export const CreateNewOrg = ({
	dialogType,
	setDialogType,
}: {
	dialogType: "create" | "manage" | null;
	setDialogType: (dialogType: "create" | "manage" | null) => void;
}) => {
	const navigate = useNavigate();
	const { mutate } = useOrg();
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

			await authClient.organization.setActive({
				organizationId: data.id,
			});

			await mutate();

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
			<DialogTrigger asChild></DialogTrigger>
			<DialogContent className="gap-0 p-0 rounded-xs min-w-[400px]">
				<div className="p-6 flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>Create New Organization</DialogTitle>
					</DialogHeader>
					<div className="flex gap-4">
						<div>
							<FieldLabel>Name</FieldLabel>
							<Input
								value={name}
								onChange={(e) => {
									setName(e.target.value);
									if (!slugChanged) {
										setSlug(slugify(e.target.value));
									}
								}}
							/>
						</div>
						<div>
							<FieldLabel>Slug</FieldLabel>
							<Input
								value={slug}
								onChange={(e) => {
									if (!slugChanged) {
										setSlug(slugify(e.target.value));
									}
								}}
							/>
						</div>
					</div>
				</div>
				<DialogFooter variant="new">
					<Button variant="add" onClick={handleCreate} isLoading={isLoading}>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
