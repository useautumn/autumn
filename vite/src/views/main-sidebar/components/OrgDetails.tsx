import { Membership } from "@autumn/shared";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/v2/buttons/Button";
import { Input } from "@/components/v2/inputs/Input";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient, useSession } from "@/lib/auth-client";
import OrgLogoUploader from "@/views/main-sidebar/org-dropdown/manage-org/OrgLogoUploader";
import { DeleteOrgPopover } from "../org-dropdown/manage-org/DeleteOrgPopover";
import { LeaveOrgPopover } from "../org-dropdown/manage-org/LeaveOrgPopover";
import { useMemberships } from "../org-dropdown/hooks/useMemberships";

export const OrgDetails = () => {
	const { org, mutate } = useOrg();
	const { memberships } = useMemberships();
	const { data: session } = useSession();

	const membership = memberships.find(
		(m: Membership) => m.user.id === session?.session?.userId,
	);
	const isOwner = membership?.member.role === "owner";

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
		<div className="px-6 pt-1.5 w-full h-full flex flex-col gap-4">
			<div className="flex flex-col gap-4">
				<div className="w-full flex justify-between items-center">
					<OrgLogoUploader />
				</div>
				<div className="w-full flex flex-col sm:flex-row gap-2 sm:gap-4">
					<OrgDetailInput
						label="Name"
						value={inputs.name}
						setValue={(value) => setInputs({ ...inputs, name: value })}
					/>
					<OrgDetailInput
						label="Slug"
						value={inputs.slug}
						setValue={(value) => setInputs({ ...inputs, slug: value })}
					/>
					<div>
						<FieldLabel>&nbsp;</FieldLabel>
						<Button
							variant="secondary"
							disabled={!canSave}
							onClick={handleSave}
							isLoading={saving}
							className="min-w-16"
						>
							Save
						</Button>
					</div>
				</div>
			</div>
			<Separator className="my-2" />
			{isOwner ? <DeleteOrgPopover /> : <LeaveOrgPopover />}
		</div>
	);
};

const OrgDetailInput = ({
	label,
	value,
	setValue,
}: {
	label: string;
	value: string;
	setValue: (value: string) => void;
}) => {
	return (
		<div className="flex flex-col">
			<FieldLabel>{label}</FieldLabel>
			<div className="flex items-center gap-2">
				<Input value={value} onChange={(e) => setValue(e.target.value)} />
			</div>
		</div>
	);
};
