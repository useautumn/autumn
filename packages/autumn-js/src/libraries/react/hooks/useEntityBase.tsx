import type * as models from "@useautumn/sdk/models";
import { useContext } from "react";
import useSWR from "swr";
import type {
	AttachParams,
	CancelParams,
	CheckParams,
	EntityGetParams,
	TrackParams,
} from "../client/autumnTypes";
import { type AutumnContextParams, useAutumnContext } from "../AutumnContext";
import { handleCheck, openDialog } from "./helpers/handleCheck";
import { useAutumnBase } from "./helpers/useAutumnBase";

export const useEntityBase = ({
	entityId,
	params,
	AutumnContext,
}: {
	entityId: string | null;
	params?: EntityGetParams;
	AutumnContext: React.Context<AutumnContextParams>;
}) => {
	const { client } = useContext(AutumnContext);
	const queryKey = ["entity", entityId, params?.expand];

	const context = useAutumnContext({
		AutumnContext,
		name: "useEntity",
	});

	const fetchEntity = async () => {
		if (!entityId) {
			return null;
		}

		return await client.entities.get(entityId, params);
	};

	const { data, error, isLoading, mutate } = useSWR(queryKey, fetchEntity, {
		fallbackData: null,
		shouldRetryOnError: false,
		onErrorRetry: (error: any, _key: any, _config: any) => {
			if (error.code == "entity_not_found") {
				return false;
			}

			return true;
		},
	});

	const {
		attach: attachAutumn,
		cancel: cancelAutumn,
		track: trackAutumn,
	} = useAutumnBase({ context, client });

	const check = (params: CheckParams) => {
		const result = handleCheck({ customer: data, params, isEntity: true });

		openDialog({
			result: result,
			params,
			context: context!,
		});

		return result;
	};

	const attach = (params: AttachParams) =>
		attachAutumn({ ...params, entityId: entityId || undefined });
	const cancel = (params: CancelParams) =>
		cancelAutumn({ ...params, entityId: entityId || undefined });
	const track = (params: TrackParams) =>
		trackAutumn({ ...params, entityId: entityId || undefined });

	if (!entityId) {
		return {
			entity: null,
			isLoading: false,
			error: null,
			refetch: mutate as () => Promise<models.Entity | null>,
			check,
			attach,
			cancel,
			track,
		};
	}

	return {
		entity: error ? null : data,
		isLoading,
		error,
		refetch: mutate as () => Promise<models.Entity | null>,
		check,
		attach,
		cancel,
		track,
	};
};
