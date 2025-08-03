import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreateFeature } from "@/views/features/CreateFeature";
import { useProductItemContext } from "../ProductItemContext";
import {
  ProductItemInterval,
  ProductItem,
  CreateFeature as CreateFeatureType,
} from "@autumn/shared";

export const CreateFeatureFromItem = () => {
  const {
    setShowCreateFeature,
    setOpen,
    open,
    setFeatures,
    setItem,
    features,
    item,
  } = useProductItemContext();

  const setSelectedFeature = (feature: CreateFeatureType) => {
    setFeatures([...features, feature]);
    setItem({ ...item, feature_id: feature.id! });
  };

  return (
    <>
      <DialogHeader className="p-0">
        <div className="flex flex-col  ">
          {features.length > 0 && (
            <Button
              variant="ghost"
              className="text-xs py-0 px-2 w-fit -ml-5 -mt-5 hover:bg-transparent"
              onClick={() => setShowCreateFeature(false)}
            >
              ← Product
            </Button>
          )}

          <DialogTitle>
            {/* {showCreateFeature || (features.length == 0 && item.price === null)
              ? "Create Feature"
              : "Add Product Item"} */}
            Create Feature
          </DialogTitle>
        </div>
      </DialogHeader>
      <div className="flex !overflow-visible  w-fit">
        <div className="w-full -mt-2">
          <CreateFeature
            isFromEntitlement={true}
            setShowFeatureCreate={setShowCreateFeature}
            setSelectedFeature={setSelectedFeature}
            setOpen={setOpen}
            open={open}
          />
        </div>
        {/* {showCreateFeature || (features.length == 0 && item.price === null) ? (
            <div className="w-full -mt-2">
              <CreateFeature
                isFromEntitlement={true}
                setShowFeatureCreate={setShowCreateFeature}
                setSelectedFeature={setSelectedFeature}
                setOpen={setOpen}
                open={open}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4 w-fit !overflow-visible">
              <ProductItemConfig />
            </div>
          )} */}
      </div>
    </>
  );
};
