"""Tool definitions. All of them are sent on every call, whatever the question is."""

TOOL_NAMES = [
    "get_order", "list_orders", "cancel_order", "refund_order", "get_invoice", "update_address",
    "get_shipment", "reschedule_delivery", "get_loyalty_points", "redeem_points", "open_ticket",
    "escalate_ticket", "get_product", "search_products", "check_stock", "get_store_hours",
]

TOOL_SPECS = [
    {
        "toolSpec": {
            "name": name,
            "description": f"{name.replace('_', ' ')} for the signed-in customer.",
            "inputSchema": {"json": {"type": "object", "properties": {"id": {"type": "string"}}}},
        }
    }
    for name in TOOL_NAMES
]


def run_tool(tool_use: dict) -> dict:
    # Stub: a real implementation would call the order service.
    return {"toolResult": {"toolUseId": tool_use["toolUseId"], "content": [{"text": "{}"}]}}
