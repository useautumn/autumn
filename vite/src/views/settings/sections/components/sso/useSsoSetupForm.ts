import { toast } from "sonner";
import { useAppForm } from "@/hooks/form/form";
import {
	buildSsoConnectionPayload,
	createSsoFormSchema,
	type SsoFormValues,
} from "@/lib/sso/ssoForm";
import { getBackendErr } from "@/utils/genUtils";
import type { useSsoActions } from "./useSsoActions";

const EMPTY_VALUES: SsoFormValues = {
	domain: "",
	issuer: "",
	clientId: "",
	clientSecret: "",
};

const SSO_FORM_SCHEMA = createSsoFormSchema({
	allowInsecureLocalhost: import.meta.env.DEV,
});

export const useSsoSetupForm = ({
	create,
}: {
	create: ReturnType<typeof useSsoActions>["create"];
}) =>
	useAppForm({
		defaultValues: EMPTY_VALUES,
		validators: { onChange: SSO_FORM_SCHEMA, onSubmit: SSO_FORM_SCHEMA },
		onSubmit: async ({ value, formApi }) => {
			try {
				await create.mutateAsync(buildSsoConnectionPayload(value));
				// The secret is write-only: drop it as soon as the request succeeds.
				formApi.reset();
				toast.success("SSO connection created");
			} catch (error) {
				toast.error(
					getBackendErr(error, "Failed to create the SSO connection"),
				);
			}
		},
	});
