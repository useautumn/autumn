import { Badge } from "@/components/ui/badge";
import { FeatureType } from "@autumn/shared";

interface FeatureTypeBadgeProps {
  type: string | undefined;
}

export function FeatureTypeBadge({ type }: FeatureTypeBadgeProps) {
  const variant = type === FeatureType.Metered ? "purple" : "blue";
  
  return (
    <Badge variant={variant}>
      {type}
    </Badge>
  );
}
