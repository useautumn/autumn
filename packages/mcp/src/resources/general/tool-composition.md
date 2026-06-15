---
name: tool-composition
title: Tool Composition
description: How to compose Autumn MCP tools for operational questions.
priority: 0.8
audience:
  - assistant
---

# Tool Composition

Use Autumn tools as composable primitives.

- Use listPlans first for questions based on plan attributes.
- Use listCustomers for customer-heavy questions, with filters and pagination.
- Use getPlan or getCustomer only when list results are missing required detail.
- Do not fan out into many getCustomer calls unless the user needs per-customer details not present in listCustomers.
- Use getOrCreateCustomer only when the user explicitly asks to create/pre-create a customer.
- Use updateCustomer to set customer email before invoice-mode billing when an existing customer is missing email.
- Use createPlan for confirmed plan configuration writes.
- Use previewCreateBalance before createBalance for standalone balance or credit grants.
- Use previewCreateSchedule before createSchedule for multi-phase billing schedules.
- Use epochMillisecondsToDate before explaining epoch millisecond response fields such as starts_at, expires_at, next_reset_at, or billing period timestamps.
- For billing writes, always preview first and wait for explicit user confirmation before applying.

Docs index: https://docs.useautumn.com/llms.txt
