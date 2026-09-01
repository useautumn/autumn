import { CusProductStatus } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

export const inheritPendingCreatedAt = async ({
	ctx,
	metadataId,
	createdAt,
}: {
	ctx: AutumnContext;
	metadataId?: string | null;
	createdAt: number;
}) => {
	if (!metadataId) return;

	const replacements = await CusProductService.getByMetadataId({
		db: ctx.db,
		metadataId,
		orgId: ctx.org.id,
		env: ctx.env,
		inStatuses: [CusProductStatus.Pending],
	});

	for (const replacement of replacements) {
		await CusProductService.update({
			ctx,
			cusProductId: replacement.id,
			updates: { created_at: createdAt },
		});
	}
};
