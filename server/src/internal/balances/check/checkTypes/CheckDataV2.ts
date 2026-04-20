import type {
	ApiBalanceV1,
	ApiCustomerV5,
	ApiEntityV2,
	ApiFlagV0,
	FullSubject,
} from "@autumn/shared";
import type { CheckData } from "@/internal/api/check/checkTypes/CheckData.js";

export interface CheckDataV2 extends CheckData {
	fullSubject: FullSubject;
	evaluationApiSubject: ApiCustomerV5 | ApiEntityV2;
	evaluationApiBalance?: ApiBalanceV1;
	evaluationApiFlag?: ApiFlagV0;
}
