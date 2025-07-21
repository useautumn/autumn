import { TableButton } from "@/components/general/table-components/TableButton";
import { updateSearchParams } from "@/utils/navUtils";
import { FullCusProduct } from "@autumn/shared";
import { ExternalLinkIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { useCustomerContext } from "../CustomerContext";

export const CusProductEntityItem = ({
  internalEntityId,
}: {
  internalEntityId?: string | null;
}) => {
  const { entities } = useCustomerContext();
  // console.log("Cus product", cusProduct);
  const entity = entities.find((e: any) => e.internal_id === internalEntityId);

  const navigate = useNavigate();
  return internalEntityId ? (
    <TableButton
      onClick={() => {
        updateSearchParams({
          navigate,
          params: {
            entity_id: entity?.id || entity?.internal_id,
          },
        });
      }}
      // icon={<ExternalLinkIcon size={12} />}
    >
      <span className="truncate">
        {entity?.name || entity?.id || "Unknown"}
      </span>
    </TableButton>
  ) : (
    <span></span>
  );
};
