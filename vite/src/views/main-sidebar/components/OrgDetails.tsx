import { Button, CopyButton, Input } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient } from "@/lib/auth-client";
import OrgLogoUploader from "@/views/main-sidebar/org-dropdown/manage-org/OrgLogoUploader";
import {
	SETTINGS_LIST_CLASS,
	SettingsGroup,
} from "@/views/settings/components/SettingsGroup";
import { SettingsListRow } from "@/views/settings/components/SettingsListRow";

const FIELD_CLASS = "w-[280px] shrink-0";

export const OrgDetails = () => {
	const { org, mutate } = useOrg();

	const [inputs, setInputs] = useState({
		name: org?.name,
		slug: org?.slug,
	});

	const [saving, setSaving] = useState(false);

	const isDirty = inputs.name !== org?.name || inputs.slug !== org?.slug;

	const handleSave = async () => {
		try {
			setSaving(true);
			const { error } = await authClient.organization.update({
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
		<SettingsGroup
			title="General"
			description="How your organization shows up across Autumn."
			trailing={
				isDirty && (
					<Button size="sm" onClick={handleSave} isLoading={saving}>
						Save
					</Button>
				)
			}
		>
			<div className={SETTINGS_LIST_CLASS}>
				<OrgLogoUploader />
				<SettingsListRow
					title="Name"
					description="Shown to everyone in your organization"
				>
					<Input
						value={inputs.name}
						onChange={(e) => setInputs({ ...inputs, name: e.target.value })}
						className={`${FIELD_CLASS} !bg-background`}
					/>
				</SettingsListRow>
				<SettingsListRow
					title="Slug"
					description="Lowercase letters, numbers and dashes"
				>
					<Input
						value={inputs.slug}
						onChange={(e) => setInputs({ ...inputs, slug: e.target.value })}
						className={`${FIELD_CLASS} !bg-background`}
					/>
				</SettingsListRow>
				<SettingsListRow
					title="Organization ID"
					description="Share this with support when asking for help"
				>
					<CopyButton
						text={org.id}
						size="mini"
						className="shrink-0 text-tertiary-foreground"
						innerClassName="max-w-56 text-tiny-id truncate !font-normal"
					/>
				</SettingsListRow>
			</div>
		</SettingsGroup>
	);
};
