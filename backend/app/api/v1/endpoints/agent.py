"""AI Agent chatbot endpoints.

Provides conversation management and message handling for the
interactive AI assistant with read/write tool capabilities.
"""

import logging
from typing import Any, Dict, List, Optional

from app.api import deps
from app.core.limiter import limiter
from app.db.repositories.instance import ai_conversations, ai_messages
from app.services.agent_service import execute_write_tool, run_agent_turn
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class ConversationCreate(BaseModel):
    title: str = "Novi razgovor"


class MessageCreate(BaseModel):
    content: str


class ConfirmAction(BaseModel):
    message_id: str
    confirmed: bool


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_message(msg) -> dict:
    return ai_messages.to_dict(msg)


def _serialize_conversation(conv, include_messages: bool = False) -> dict:
    data = ai_conversations.to_dict(conv)
    if include_messages and hasattr(conv, "messages") and conv.messages:
        data["messages"] = [_serialize_message(m) for m in conv.messages]
    else:
        data.pop("messages", None)
    return data


async def _get_user_conversation(conversation_id: str, user_id: str):
    """Fetch conversation and verify ownership."""
    conv = await ai_conversations.get_by_id(conversation_id)
    if not conv or conv.user_id != user_id:
        raise HTTPException(status_code=404, detail="Razgovor nije pronađen")
    return conv


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/conversations")
@limiter.limit("30/minute")
async def create_conversation(
    request: Request,
    body: ConversationCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Create a new AI conversation."""
    conv = await ai_conversations.create(
        {
            "title": body.title,
            "user_id": current_user["id"],
        }
    )
    return _serialize_conversation(conv)


@router.get("/conversations")
async def list_conversations(
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """List conversations for the current user."""
    rows, _ = await ai_conversations.find_many(
        filters={"user_id": current_user["id"]},
        order_by="-updated_at",
        limit=50,
    )
    return [_serialize_conversation(c) for c in rows]


@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Get a conversation with all its messages."""
    conv = await _get_user_conversation(conversation_id, current_user["id"])
    return _serialize_conversation(conv, include_messages=True)


@router.post("/conversations/{conversation_id}/messages")
@limiter.limit("10/minute")
async def send_message(
    request: Request,
    conversation_id: str,
    body: MessageCreate,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Send a message to the AI agent and get a response."""
    conv = await _get_user_conversation(conversation_id, current_user["id"])

    # Save user message
    user_msg = await ai_messages.create(
        {
            "conversation_id": conversation_id,
            "role": "user",
            "content": body.content,
        }
    )

    # Build history from existing messages
    history = []
    if hasattr(conv, "messages") and conv.messages:
        for m in conv.messages:
            # Skip the message we just created (it's already in the list
            # due to selectin loading after create)
            if m.id == user_msg.id:
                continue
            history.append({"role": m.role, "content": m.content})

    # Run agent turn
    try:
        assistant_text, pending_action = await run_agent_turn(
            history, body.content
        )
    except Exception as e:
        logger.exception("Agent turn failed")
        assistant_text = "Ispričavam se, došlo je do greške. Molim pokušajte ponovo."
        pending_action = None

    # Save assistant message
    assistant_msg = await ai_messages.create(
        {
            "conversation_id": conversation_id,
            "role": "assistant",
            "content": assistant_text,
            "pending_action": pending_action,
        }
    )

    # Update conversation timestamp (and title if first message)
    update_data = {}
    # Auto-title from first user message
    msg_count = 0
    if hasattr(conv, "messages") and conv.messages:
        msg_count = len([m for m in conv.messages if m.role == "user"])
    if msg_count <= 1 and conv.title == "Novi razgovor":
        update_data["title"] = body.content[:60]
    if update_data:
        await ai_conversations.update_by_id(conversation_id, update_data)

    return {
        "user_message": _serialize_message(user_msg),
        "assistant_message": _serialize_message(assistant_msg),
    }


@router.post("/conversations/{conversation_id}/confirm")
@limiter.limit("10/minute")
async def confirm_action(
    request: Request,
    conversation_id: str,
    body: ConfirmAction,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Confirm or reject a pending write action."""
    await _get_user_conversation(conversation_id, current_user["id"])

    # Find the message with pending action
    msg = await ai_messages.get_by_id(body.message_id)
    if not msg or msg.conversation_id != conversation_id:
        raise HTTPException(status_code=404, detail="Poruka nije pronađena")

    if not msg.pending_action:
        raise HTTPException(status_code=400, detail="Nema akcije za potvrdu")

    pending = msg.pending_action

    if body.confirmed:
        # Execute the write tool
        result_str = await execute_write_tool(
            pending["tool_name"],
            pending["tool_input"],
            current_user["id"],
        )

        # Save confirmation result as new assistant message
        import json
        result = json.loads(result_str)
        if result.get("success"):
            response_text = f"Izvršeno: {result.get('message', 'Akcija uspješno izvršena.')}"
        else:
            response_text = f"Greška: {result.get('error', 'Nepoznata greška.')}"

        result_msg = await ai_messages.create(
            {
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": response_text,
            }
        )

        # Clear pending action
        await ai_messages.update_by_id(body.message_id, {"pending_action": None})

        return {"status": "executed", "message": _serialize_message(result_msg)}
    else:
        # User rejected — clear pending action
        await ai_messages.update_by_id(body.message_id, {"pending_action": None})

        reject_msg = await ai_messages.create(
            {
                "conversation_id": conversation_id,
                "role": "assistant",
                "content": "Razumijem, akcija je otkazana. Kako vam još mogu pomoći?",
            }
        )

        return {"status": "rejected", "message": _serialize_message(reject_msg)}


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: Dict[str, Any] = Depends(deps.get_current_user),
):
    """Delete a conversation and all its messages."""
    await _get_user_conversation(conversation_id, current_user["id"])
    await ai_conversations.delete_by_id(conversation_id)
    return {"message": "Razgovor obrisan"}
