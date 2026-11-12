# Support assistant: design notes

- Customers ask about orders, deliveries and refunds in the web chat. The assistant answers with tools.
- Model: one model for everything, chosen for answer quality at launch. No evaluation set yet.
- The system prompt is the full support policy (`docs/support-policy.md`), about 6,000 tokens.
- A nightly job summarises closed tickets for the dashboard the team reads the next morning.
- Cost: the monthly AWS Budget in `infra/template.yaml` emails finance at 80%. Cost is reviewed in the
  monthly ops meeting from the AWS bill.
- Logging: application logs only. Bedrock model invocation logging is not enabled.
