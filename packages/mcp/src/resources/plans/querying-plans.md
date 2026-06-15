---
name: querying-plans
title: Querying Plans
description: How to answer plan-filtering questions with listPlans.
priority: 0.8
audience:
  - assistant
---

# Querying Plans

listPlans is usually a cheap full scan because organizations generally have a small number of plans.

Use listPlans for questions about:
- plan price thresholds
- free trials
- archived plans
- custom plan variants
- plan versions
- plan features and included quantities

Filter the returned plans locally. If the user asks for customers on matching plans, first resolve the matching plans, then call listCustomers with those plan ids. For upcoming, queued, or scheduled version queries, pass only the relevant target versions to listCustomers; with numeric versions, exclude the earliest historical version unless the user asks for all historical versions.

