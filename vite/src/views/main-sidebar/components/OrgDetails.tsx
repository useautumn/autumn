import { Button, FormLabel, Input, Separator } from "@autumn/ui";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient } from "@/lib/auth-client";
import OrgLogoUploader from "@/views/main-sidebar/org-dropdown/manage-org/OrgLogoUploader";
import { useCurrentMembership } from "../org-dropdown/hooks/useCurrentMembership";
import { DeleteOrgPopover } from "../org-dropdown/manage-org/DeleteOrgPopover";
import { LeaveOrgPopover } from "../org-dropdown/manage-org/LeaveOrgPopover";

export const OrgDetails = () => {
	const { org, mutate } = useOrg();
	const { isOwner } = useCurrentMembership();

	const [inputs, setInputs] = useState({
		name: org?.name,
		slug: org?.slug,
	});

	const [saving, setSaving] = useState(false);

	const canSave = useMemo(() => {
		return inputs.name !== org?.name || inputs.slug !== org?.slug;
	}, [inputs, org]);

	const handleSave = async () => {
		try {
			setSaving(true);
			const { data, error } = await authClient.organization.update({
				data: {
					name: inputs.name,
					slug: inputs.slug,
				},
				organizationId: org.id,
			});
			if (error) {
				toast.error(error.message || "Failed to update organization");
				return;
			}
			await mutate();
			toast.success("Successfully updated organization");
		} catch (error) {
			console.error(error);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="w-full flex flex-col gap-4">
			<OrgLogoUploader />
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div className="flex flex-col">
					<FormLabel>
						<span className="text-muted-foreground">Name</span>
					</FormLabel>
					<Input
						value={inputs.name}
						onChange={(e) => setInputs({ ...inputs, name: e.target.value })}
					/>
				</div>
				<div className="flex flex-col">
					<FormLabel>
						<span className="text-muted-foreground">Slug</span>
					</FormLabel>
					<Input
						value={inputs.slug}
						onChange={(e) => setInputs({ ...inputs, slug: e.target.value })}
					/>
				</div>
			</div>
			<div>
				<Button
					variant="primary"
					disabled={!canSave}
					onClick={handleSave}
					isLoading={saving}
					className="min-w-20"
				>
					Save
				</Button>
			</div>
			<Separator className="my-2" />
			{isOwner ? <DeleteOrgPopover /> : <LeaveOrgPopover />}
		</div>
	);
};
