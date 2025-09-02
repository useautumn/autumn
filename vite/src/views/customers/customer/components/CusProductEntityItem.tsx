import { TableButton } from "@/components/general/table-components/TableButton";
import { updateSearchParams } from "@/utils/navUtils";
import { FullCusProduct } from "@autumn/shared";
import { ExternalLinkIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { useCustomerContext } from "../CustomerContext";
import { useCusQuery } from "../hooks/useCusQuery";

export const CusProductEntityItem = ({
  internalEntityId,
}: {
  internalEntityId?: string | null;
}) => {
  const { customer } = useCusQuery();

  const entity = customer.entities.find(
    (e: any) => e.internal_id === internalEntityId
  );

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
    >
      <span className="truncate">
        {entity?.name || entity?.id || "Unknown"}
      </span>
    </TableButton>
  ) : (
    <span></span>
  );
};
