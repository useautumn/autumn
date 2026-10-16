import {
	type PermissionDenial,
	PermissionDeniedErrorSchema,
	PreviewPermissionSchema,
} from "./permissionSchemas";

/** Only an enforced deny counts; in shadow mode the write would still go through. */
const denialFromPreview = ({
	preview,
}: {
	preview: unknown;
}): PermissionDenial | null => {
	const permission = (preview as { permission?: unknown } | null)?.permission;
	const parsed = PreviewPermissionSchema.safeParse(permission);
	if (!parsed.success) return null;
	if (parsed.data.verdict !== "deny" || parsed.data.enforced !== true) {
		return null;
	}
	const { verdict: _verdict, enforced: _enforced, ...denial } = parsed.data;
	return denial;
};

export const denialFromError = ({
	error,
}: {
	error: unknown;
}): PermissionDenial | null => {
	const parsed = PermissionDeniedErrorSchema.safeParse(error);
	if (!parsed.success) return null;
	const { message, details } = parsed.data.response.data;
	return { message, ...details };
};

/**
 * An enforced preview deny locks submit. A 403 from submit shows the same way
 * but leaves the button enabled so an edited request can be retried.
 */
export const resolvePermissionDenial = ({
	preview,
	error,
}: {
	preview: unknown;
	error: unknown;
}) => {
	const previewDenial = denialFromPreview({ preview });
	if (previewDenial) return { denial: previewDenial, locksSubmit: true };

	const submitDenial = denialFromError({ error });
	if (submitDenial) return { denial: submitDenial, locksSubmit: false };

	return null;
};
