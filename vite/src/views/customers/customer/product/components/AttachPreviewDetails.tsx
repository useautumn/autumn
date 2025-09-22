import { useProductContext } from "@/views/products/product/ProductContext";
import React from "react";
import { AttachNewItems } from "./attach-preview/AttachNewItems";
import { DueToday } from "./attach-preview/DueToday";
import { DueNextCycle } from "./attach-preview/DueNextCycle";
import { UpdateQuantity } from "./attach-preview/UpdateQuantity";
import { AttachBranch } from "@autumn/shared";
import { OptionsInput } from "./attach-preview/OptionsInput";

export const AttachPreviewDetails = () => {
	const { attachState } = useProductContext();
	const { preview } = attachState;

	if (!preview) {
		return null;
	}

	const branch = preview.branch;
	const isUpdatePrepaidQuantity = branch == AttachBranch.UpdatePrepaidQuantity;

	return (
		<React.Fragment>
			<UpdateQuantity />
			{!isUpdatePrepaidQuantity && (
				<>
					<DueToday />
					<AttachNewItems />
				</>
			)}
			<DueNextCycle />
		</React.Fragment>
	);
};
