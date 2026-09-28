import { AxiomWithoutBatching } from "@axiomhq/js";
import type { AxiomClient, AxiomClientConfig } from "./types/axiomClient.js";

export const createAxiomClient = ({
	config,
}: {
	config: AxiomClientConfig;
}): AxiomClient => ({
	api: new AxiomWithoutBatching({ token: config.token, orgId: config.orgId }),
});
