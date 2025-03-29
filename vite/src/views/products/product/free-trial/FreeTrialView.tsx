import { CreateFreeTrial } from "./CreateFreeTrial";
import { EditFreeTrialToolbar } from "./EditFreeTrialToolbar";

export const FreeTrialView = ({ product }: { product: any }) => {
  return (
    <>
      {product.free_trial && (
        <>
          <div className="flex justify-between gap-4 bg-white p-3 rounded-sm border overflow-x-auto">
            <div className="flex gap-16 shrink-0">
              <div className="flex rounded-sm items-center gap-6">
                <p className="text-xs text-t2 w-32 bg-stone-50 font-medium p-1 text-center">
                  Length{" "}
                </p>
                <p className="text-sm text-t2">
                  {product.free_trial.length} days
                </p>
              </div>
              <div className="flex rounded-sm items-center gap-6">
                <p className="text-xs text-t2 bg-stone-50 font-medium p-1 w-32 text-center">
                  Unique Fingerprint
                </p>
                <p className="text-sm text-t2">
                  {product.free_trial.unique_fingerprint ? "Yes" : "No"}
                </p>
              </div>
              <div className="flex rounded-sm items-center gap-6">
                <p className="text-xs text-t2 bg-stone-50 font-medium p-1 w-32 text-center">
                  Card Required
                </p>
                <p className="text-sm text-t2">Yes</p>
              </div>
            </div>
            <EditFreeTrialToolbar product={product} />
          </div>
        </>
      )}
      {!product.free_trial && <CreateFreeTrial />}
    </>
  );
};
