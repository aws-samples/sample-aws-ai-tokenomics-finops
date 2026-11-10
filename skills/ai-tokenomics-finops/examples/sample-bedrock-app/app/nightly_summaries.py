"""Nightly job: summarise the day's closed tickets for the support dashboard.

Nobody reads the summaries until the next morning, but each one is a synchronous on-demand call.
"""

import boto3

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")


def summarise(tickets: list) -> list:
    summaries = []
    for ticket in tickets:
        response = bedrock.converse(
            modelId="us.anthropic.claude-opus-4-1-20250805-v1:0",
            messages=[{"role": "user", "content": [{"text": "Summarise this ticket:\n" + ticket["body"]}]}],
            inferenceConfig={"maxTokens": 8192},
        )
        summaries.append(response["output"]["message"]["content"][0]["text"])
    return summaries
