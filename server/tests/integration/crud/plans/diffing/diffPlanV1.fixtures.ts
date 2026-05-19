import type { ApiPlanV1 } from "@autumn/shared";

export const popflyStart = {
	"id": "start",
	"name": "Run",
	"description": null,
	"group": null,
	"version": 8,
	"add_on": false,
	"auto_enable": false,
	"price": {
		"amount": 499,
		"interval": "month",
		"display": {
			"primary_text": "$499",
			"secondary_text": "per month"
		}
	},
	"items": [
		{
			"feature_id": "adventures",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Adventures"
			}
		},
		{
			"feature_id": "adventures_visible",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited adventures visible"
			}
		},
		{
			"feature_id": "affiliate_programs",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited affiliate programs"
			}
		},
		{
			"feature_id": "affiliates_csv_export",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Affiliates CSV Export"
			}
		},
		{
			"feature_id": "affiliates_per_program",
			"included": 0,
			"unlimited": true,
			"reset": {
				"interval": "one_off"
			},
			"price": null,
			"display": {
				"primary_text": "Unlimited affiliates per program"
			}
		},
		{
			"feature_id": "affiliates_reporting",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Affiliates Reporting"
			}
		},
		{
			"feature_id": "campaign_progress_management",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Campaign Progress Management"
			}
		},
		{
			"feature_id": "campaigns",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Campaigns"
			}
		},
		{
			"feature_id": "connections_limit_company_with_company",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited company connections limits"
			}
		},
		{
			"feature_id": "company_members",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited company members"
			}
		},
		{
			"feature_id": "content",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Content"
			}
		},
		{
			"feature_id": "content_storage",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited content storages"
			}
		},
		{
			"feature_id": "connections_limit_company_with_creators",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited creator connections limits"
			}
		},
		{
			"feature_id": "creator_discovery_advanced",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Creator Discovery Advanced"
			}
		},
		{
			"feature_id": "gifting_invitations",
			"included": 200,
			"unlimited": false,
			"reset": {
				"interval": "month"
			},
			"price": null,
			"display": {
				"primary_text": "200 gifting invitations"
			}
		},
		{
			"feature_id": "gifting_products",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited gifting products"
			}
		},
		{
			"feature_id": "invite_through_popfly_advanced",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Invite Through Popfly Advanced"
			}
		},
		{
			"feature_id": "invoice_fee",
			"included": 390,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "390 invoice fees"
			}
		},
		{
			"feature_id": "campaigns_private_monthly",
			"included": 0,
			"unlimited": true,
			"reset": {
				"interval": "month"
			},
			"price": null,
			"display": {
				"primary_text": "Unlimited monthly private campaigns"
			}
		},
		{
			"feature_id": "campaigns_public_monthly",
			"included": 0,
			"unlimited": true,
			"reset": {
				"interval": "month"
			},
			"price": null,
			"display": {
				"primary_text": "Unlimited monthly public campaigns"
			}
		},
		{
			"feature_id": "campaigns_unlisted_monthly",
			"included": 0,
			"unlimited": true,
			"reset": {
				"interval": "month"
			},
			"price": null,
			"display": {
				"primary_text": "Unlimited Monthly Unlisted Campaigns"
			}
		},
		{
			"feature_id": "packs",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Packs"
			}
		},
		{
			"feature_id": "playbook",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Playbook"
			}
		},
		{
			"feature_id": "popfly_platform",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Popfly Platform"
			}
		},
		{
			"feature_id": "affiliate_programs_public",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited public affiliate programs"
			}
		},
		{
			"feature_id": "social_listening",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Social Listening"
			}
		},
		{
			"feature_id": "social_listening_mention_results",
			"included": 25,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "25 social listening mention results"
			}
		},
		{
			"feature_id": "social_listening_platforms",
			"included": 1,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "1 Social Listening Platform"
			}
		},
		{
			"feature_id": "social_listening_refresh_frequency_in_hours",
			"included": 168,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "168 social listening refresh frequencies (hours)"
			}
		},
		{
			"feature_id": "social_listening_terms",
			"included": 1,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "1 social listening term"
			}
		},
		{
			"feature_id": "social_listening_topics",
			"included": 1,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "1 social listening topic"
			}
		}
	],
	"created_at": 1777460151677,
	"env": "live",
	"archived": false,
	"base_variant_id": null,
	"config": {
		"ignore_past_due": false
	}
} as ApiPlanV1;

export const popflyStartAnnual = {
	"id": "start_annual",
	"name": "Run - annual",
	"description": null,
	"group": null,
	"version": 9,
	"add_on": false,
	"auto_enable": false,
	"price": {
		"amount": 5988,
		"interval": "year",
		"display": {
			"primary_text": "$5,988",
			"secondary_text": "per year"
		}
	},
	"items": [
		{
			"feature_id": "adventures",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Adventures"
			}
		},
		{
			"feature_id": "adventures_visible",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited adventures visible"
			}
		},
		{
			"feature_id": "affiliate_programs",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited affiliate programs"
			}
		},
		{
			"feature_id": "affiliates_csv_export",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Affiliates CSV Export"
			}
		},
		{
			"feature_id": "affiliates_per_program",
			"included": 0,
			"unlimited": true,
			"reset": {
				"interval": "one_off"
			},
			"price": null,
			"display": {
				"primary_text": "Unlimited affiliates per program"
			}
		},
		{
			"feature_id": "affiliates_reporting",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Affiliates Reporting"
			}
		},
		{
			"feature_id": "campaign_progress_management",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Campaign Progress Management"
			}
		},
		{
			"feature_id": "campaigns",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Campaigns"
			}
		},
		{
			"feature_id": "connections_limit_company_with_company",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited company connections limits"
			}
		},
		{
			"feature_id": "company_members",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited company members"
			}
		},
		{
			"feature_id": "content",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Content"
			}
		},
		{
			"feature_id": "content_storage",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited content storages"
			}
		},
		{
			"feature_id": "connections_limit_company_with_creators",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited creator connections limits"
			}
		},
		{
			"feature_id": "creator_discovery_advanced",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Creator Discovery Advanced"
			}
		},
		{
			"feature_id": "gifting_invitations",
			"included": 200,
			"unlimited": false,
			"reset": {
				"interval": "month"
			},
			"price": null,
			"display": {
				"primary_text": "200 gifting invitations"
			}
		},
		{
			"feature_id": "gifting_products",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited gifting products"
			}
		},
		{
			"feature_id": "invite_through_popfly_advanced",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Invite Through Popfly Advanced"
			}
		},
		{
			"feature_id": "invoice_fee",
			"included": 390,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "390 invoice fees"
			}
		},
		{
			"feature_id": "campaigns_private_monthly",
			"included": 0,
			"unlimited": true,
			"reset": {
				"interval": "month"
			},
			"price": null,
			"display": {
				"primary_text": "Unlimited monthly private campaigns"
			}
		},
		{
			"feature_id": "campaigns_public_monthly",
			"included": 0,
			"unlimited": true,
			"reset": {
				"interval": "month"
			},
			"price": null,
			"display": {
				"primary_text": "Unlimited monthly public campaigns"
			}
		},
		{
			"feature_id": "campaigns_unlisted_monthly",
			"included": 0,
			"unlimited": true,
			"reset": {
				"interval": "month"
			},
			"price": null,
			"display": {
				"primary_text": "Unlimited Monthly Unlisted Campaigns"
			}
		},
		{
			"feature_id": "packs",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Packs"
			}
		},
		{
			"feature_id": "playbook",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Playbook"
			}
		},
		{
			"feature_id": "popfly_platform",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Popfly Platform"
			}
		},
		{
			"feature_id": "affiliate_programs_public",
			"included": 0,
			"unlimited": true,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Unlimited public affiliate programs"
			}
		},
		{
			"feature_id": "social_listening",
			"included": 0,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "Social Listening"
			}
		},
		{
			"feature_id": "social_listening_mention_results",
			"included": 25,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "25 social listening mention results"
			}
		},
		{
			"feature_id": "social_listening_platforms",
			"included": 1,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "1 Social Listening Platform"
			}
		},
		{
			"feature_id": "social_listening_refresh_frequency_in_hours",
			"included": 168,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "168 social listening refresh frequencies (hours)"
			}
		},
		{
			"feature_id": "social_listening_terms",
			"included": 1,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "1 social listening term"
			}
		},
		{
			"feature_id": "social_listening_topics",
			"included": 1,
			"unlimited": false,
			"reset": null,
			"price": null,
			"display": {
				"primary_text": "1 social listening topic"
			}
		}
	],
	"created_at": 1777460152188,
	"env": "live",
	"archived": false,
	"base_variant_id": null,
	"config": {
		"ignore_past_due": false
	}
} as ApiPlanV1;
