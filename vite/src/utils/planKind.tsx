import {
	CustomerProductKind,
	cusProductToProduct,
	type FullCusProduct,
	isOneOffProductV2,
	mapToProductV2,
} from "@autumn/shared";
import {
	CalendarDotsIcon,
	PuzzlePieceIcon,
	ReceiptIcon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

type KindConfig = { label: string; color: string; icon: ReactNode };

export function getPlanKindConfig(
	kind: CustomerProductKind,
	size = 16,
): KindConfig {
	switch (kind) {
		case CustomerProductKind.OneOff:
			return {
				label: "One-off",
				color: "text-amber-500",
				icon: <ReceiptIcon size={size} weight="fill" />,
			};
		case CustomerProductKind.AddOn:
			return {
				label: "Add-on",
				color: "text-violet-500",
				icon: <PuzzlePieceIcon size={size} weight="fill" />,
			};
		default:
			return {
				label: "Subscription",
				color: "text-blue-500",
				icon: <CalendarDotsIcon size={size} weight="fill" />,
			};
	}
}

export function getCusProductKind(
	cusProduct: FullCusProduct,
): CustomerProductKind {
	if (cusProduct.product?.is_add_on) return CustomerProductKind.AddOn;
	const items = mapToProductV2({
		product: cusProductToProduct({ cusProduct }),
	}).items;
	return isOneOffProductV2({ items })
		? CustomerProductKind.OneOff
		: CustomerProductKind.Subscription;
}
