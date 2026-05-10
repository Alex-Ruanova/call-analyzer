"""Tests for /api/calls/{id}/notes endpoints."""
from __future__ import annotations

import io

import pytest
from httpx import AsyncClient


async def _create_call(client: AsyncClient) -> int:
    files = {"file": ("note-test.mp3", io.BytesIO(b"\x00\x00"), "audio/mpeg")}
    resp = await client.post("/api/calls", files=files)
    assert resp.status_code in (201, 202)
    return resp.json()["call_id"]


@pytest.mark.anyio
async def test_notes_crud(client: AsyncClient) -> None:
    call_id = await _create_call(client)

    # List empty
    list_empty = await client.get(f"/api/calls/{call_id}/notes")
    assert list_empty.status_code == 200
    assert list_empty.json() == []

    # Create
    create = await client.post(f"/api/calls/{call_id}/notes", json={"text": "First note"})
    assert create.status_code == 201
    note = create.json()
    assert note["text"] == "First note"
    note_id = note["id"]

    # List shows it
    listed = await client.get(f"/api/calls/{call_id}/notes")
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["text"] == "First note"

    # Update
    patch = await client.patch(f"/api/notes/{note_id}", json={"text": "Edited note"})
    assert patch.status_code == 200
    assert patch.json()["text"] == "Edited note"

    # Delete
    delete = await client.delete(f"/api/notes/{note_id}")
    assert delete.status_code == 204
    after = await client.get(f"/api/calls/{call_id}/notes")
    assert after.json() == []


@pytest.mark.anyio
async def test_create_note_unknown_call(client: AsyncClient) -> None:
    resp = await client.post("/api/calls/99999/notes", json={"text": "orphan"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "call_not_found"


@pytest.mark.anyio
async def test_update_note_not_found(client: AsyncClient) -> None:
    resp = await client.patch("/api/notes/99999", json={"text": "x"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "note_not_found"


@pytest.mark.anyio
async def test_create_note_rejects_empty(client: AsyncClient) -> None:
    call_id = await _create_call(client)
    resp = await client.post(f"/api/calls/{call_id}/notes", json={"text": ""})
    assert resp.status_code == 422
