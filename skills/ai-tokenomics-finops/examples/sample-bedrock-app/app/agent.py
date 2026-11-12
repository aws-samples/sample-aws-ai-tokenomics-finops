"""Support assistant: answers a customer question with order-lookup tools on Amazon Bedrock.

Example fixture for the ai-tokenomics-finops skill. It contains deliberate cost gaps; it is not a
recommended pattern and is not meant to be deployed.
"""

import boto3

from app.tools import TOOL_SPECS, run_tool

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

# Every request goes to one frontier model, called by raw model ID.
MODEL_ID = "us.anthropic.claude-opus-4-1-20250805-v1:0"

# About 6,000 tokens of policy text, identical on every call.
with open("docs/support-policy.md", encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read()


def answer(user_id: str, question: str, history: list) -> str:
    # The full conversation history is resent on every turn; nothing trims or summarises it.
    messages = history + [{"role": "user", "content": [{"text": question}]}]
    while True:
        response = bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": SYSTEM_PROMPT}],
            messages=messages,
            toolConfig={"tools": TOOL_SPECS},
            inferenceConfig={"maxTokens": 8192, "temperature": 0.2},
        )
        message = response["output"]["message"]
        messages.append(message)
        if response["stopReason"] != "tool_use":
            return message["content"][0]["text"]
        # No cap on tool rounds: the loop runs until the model stops asking for tools.
        results = [run_tool(block["toolUse"]) for block in message["content"] if "toolUse" in block]
        messages.append({"role": "user", "content": results})
