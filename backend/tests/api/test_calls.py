"""Tests for /api/calls endpoints."""
from __future__ import annotations

import io
from unittest.mock import patch

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_upload_happy_path(client: AsyncClient, tmp_path) -> None:
    audio_bytes = b"\xff\xfb" + b"\x00" * 100  # minimal MP3-like bytes
    data = {"title": "My Call"}
    files = {"file": ("recording.mp3", io.BytesIO(audio_bytes), "audio/mpeg")}
    resp = await client.post("/api/calls", data=data, files=files)
    assert resp.status_code == 202
    body = resp.json()
    assert "call_id" in body
    assert isinstance(body["call_id"], int)


@pytest.mark.anyio
async def test_upload_bad_extension(client: AsyncClient) -> None:
    files = {"file": ("recording.mp4", io.BytesIO(b"data"), "video/mp4")}
    resp = await client.post("/api/calls", files=files)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_extension"


@pytest.mark.anyio
async def test_upload_invalid_content_type(client: AsyncClient) -> None:
    files = {"file": ("recording.mp3", io.BytesIO(b"data"), "video/mp4")}
    resp = await client.post("/api/calls", files=files)
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_content_type"


@pytest.mark.anyio
async def test_upload_oversized(client: AsyncClient) -> None:
    """File exceeding size limit is rejected with 413. Limit is patched to 100 bytes."""
    import app.api.calls as calls_module

    with patch.object(calls_module, "_MAX_UPLOAD_BYTES", 100):
        # 200 bytes — well above the patched 100-byte limit
        oversized_data = b"\xff\xfb" + b"\x00" * 200
        files = {"file": ("big.mp3", io.BytesIO(oversized_data), "audio/mpeg")}
        resp = await client.post("/api/calls", files=files)
        assert resp.status_code == 413
        assert resp.json()["error"]["code"] == "file_too_large"


@pytest.mark.anyio
async def test_list_calls_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/calls")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.anyio
async def test_list_calls_returns_uploaded(client: AsyncClient) -> None:
    audio_bytes = b"\xff\xfb" + b"\x00" * 50
    for i in range(3):
        files = {"file": (f"call{i}.mp3", io.BytesIO(audio_bytes + bytes([i])), "audio/mpeg")}
        resp = await client.post("/api/calls", data={"title": f"Call {i}"}, files=files)
        assert resp.status_code == 202

    resp = await client.get("/api/calls")
    assert resp.status_code == 200
    assert len(resp.json()) == 3


@pytest.mark.anyio
async def test_list_calls_search(client: AsyncClient) -> None:
    audio = b"\xff\xfb" + b"\x00" * 50
    await client.post("/api/calls", data={"title": "Alpha Call"}, files={"file": ("a.mp3", io.BytesIO(audio), "audio/mpeg")})
    await client.post("/api/calls", data={"title": "Beta Call"}, files={"file": ("b.mp3", io.BytesIO(audio + b"\x01"), "audio/mpeg")})

    resp = await client.get("/api/calls?search=Alpha")
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["title"] == "Alpha Call"


@pytest.mark.anyio
async def test_get_call_detail(client: AsyncClient) -> None:
    audio = b"\xff\xfb" + b"\x00" * 50
    upload_resp = await client.post("/api/calls", data={"title": "Detail Test"}, files={"file": ("x.mp3", io.BytesIO(audio), "audio/mpeg")})
    call_id = upload_resp.json()["call_id"]

    resp = await client.get(f"/api/calls/{call_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == call_id
    assert data["title"] == "Detail Test"
    assert "tags" in data
    assert "segments" in data
    assert "insights" in data
    assert "action_items" in data


@pytest.mark.anyio
async def test_get_call_detail_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/calls/99999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "call_not_found"


@pytest.mark.anyio
async def test_tag_override(client: AsyncClient) -> None:
    audio = b"\xff\xfb" + b"\x00" * 50
    upload_resp = await client.post("/api/calls", data={"title": "Tag Test"}, files={"file": ("t.mp3", io.BytesIO(audio), "audio/mpeg")})
    call_id = upload_resp.json()["call_id"]

    # Get the tags endpoint to see if any system tags exist
    tags_resp = await client.get("/api/tags")
    assert tags_resp.status_code == 200

    if tags_resp.json():
        tag_id = tags_resp.json()[0]["id"]
        patch_resp = await client.patch(f"/api/calls/{call_id}/tags", json={"tag_ids": [tag_id]})
        assert patch_resp.status_code == 200
        data = patch_resp.json()
        assert len(data["tags"]) == 1
        assert data["tags"][0]["source"] == "user"
    else:
        # No tags in DB — test empty override
        patch_resp = await client.patch(f"/api/calls/{call_id}/tags", json={"tag_ids": []})
        assert patch_resp.status_code == 200
        assert patch_resp.json()["tags"] == []


@pytest.mark.anyio
async def test_bulk_delete(client: AsyncClient) -> None:
    audio = b"\xff\xfb" + b"\x00" * 50
    ids = []
    for i in range(2):
        resp = await client.post("/api/calls", data={"title": f"Del {i}"}, files={"file": (f"del{i}.mp3", io.BytesIO(audio + bytes([i + 10])), "audio/mpeg")})
        ids.append(resp.json()["call_id"])

    resp = await client.post("/api/calls/bulk-delete", json={"ids": ids})
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2

    # Verify deleted
    list_resp = await client.get("/api/calls")
    remaining_ids = [c["id"] for c in list_resp.json()]
    assert not any(i in remaining_ids for i in ids)


@pytest.mark.anyio
async def test_export_content_disposition(client: AsyncClient) -> None:
    audio = b"\xff\xfb" + b"\x00" * 50
    upload_resp = await client.post("/api/calls", data={"title": "Export Test"}, files={"file": ("exp.mp3", io.BytesIO(audio), "audio/mpeg")})
    call_id = upload_resp.json()["call_id"]

    resp = await client.get(f"/api/calls/{call_id}/export")
    assert resp.status_code == 200
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert f"call-{call_id}-export.json" in resp.headers.get("content-disposition", "")

    data = resp.json()
    assert "call" in data
    assert "transcript" in data
    assert "exported_at" in data


@pytest.mark.anyio
async def test_call_status(client: AsyncClient) -> None:
    audio = b"\xff\xfb" + b"\x00" * 50
    upload_resp = await client.post("/api/calls", data={"title": "Status Test"}, files={"file": ("st.mp3", io.BytesIO(audio), "audio/mpeg")})
    call_id = upload_resp.json()["call_id"]

    resp = await client.get(f"/api/calls/{call_id}/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert data["progress_step"] == 0


@pytest.mark.anyio
async def test_tag_override_replaces_llm_tags(client: AsyncClient, db_session) -> None:
    """PATCH /calls/{id}/tags must wipe existing LLM tags and replace with user-supplied ones."""
    from app.models.tag import CallTag, Tag

    # Upload a call
    audio = b"\xff\xfb" + b"\x00" * 50
    upload_resp = await client.post(
        "/api/calls", data={"title": "Tag Replace Test"},
        files={"file": ("tr.mp3", __import__("io").BytesIO(audio), "audio/mpeg")},
    )
    call_id = upload_resp.json()["call_id"]

    # Seed an LLM-sourced tag directly in the DB
    llm_tag = Tag(name="llm-discovery", is_system=False)
    user_tag = Tag(name="user-follow-up", is_system=False)
    db_session.add(llm_tag)
    db_session.add(user_tag)
    await db_session.flush()

    db_session.add(CallTag(call_id=call_id, tag_id=llm_tag.id, source="llm"))
    await db_session.commit()

    # Override with user tag (different from the LLM one)
    patch_resp = await client.patch(
        f"/api/calls/{call_id}/tags", json={"tag_ids": [user_tag.id]}
    )
    assert patch_resp.status_code == 200

    data = patch_resp.json()
    tag_names = [t["name"] for t in data["tags"]]
    tag_sources = [t["source"] for t in data["tags"]]

    assert "llm-discovery" not in tag_names, "LLM tag must be removed after override"
    assert "user-follow-up" in tag_names, "User tag must be present after override"
    assert all(s == "user" for s in tag_sources), "All tags after override must have source='user'"


@pytest.mark.anyio
async def test_json_export_full_shape(client: AsyncClient) -> None:
    """Export JSON must contain all 7 top-level keys with correct types."""
    audio = b"\xff\xfb" + b"\x00" * 50
    upload_resp = await client.post("/api/calls", data={"title": "Export Shape Test"}, files={"file": ("esh.mp3", io.BytesIO(audio), "audio/mpeg")})
    call_id = upload_resp.json()["call_id"]

    resp = await client.get(f"/api/calls/{call_id}/export")
    assert resp.status_code == 200
    data = resp.json()

    # All top-level keys must be present
    assert set(data.keys()) >= {"call", "transcript", "tags", "insights", "action_items", "analysis", "exported_at"}

    # call sub-object must have id and title
    assert data["call"]["id"] == call_id
    assert data["call"]["title"] == "Export Shape Test"

    # transcript must have segments key
    assert "segments" in data["transcript"]
    assert isinstance(data["transcript"]["segments"], list)

    # tags and insights must be lists
    assert isinstance(data["tags"], list)
    assert isinstance(data["insights"], list)
    assert isinstance(data["action_items"], list)

    # exported_at must be an ISO 8601 string
    assert isinstance(data["exported_at"], str)
    assert "T" in data["exported_at"]


@pytest.mark.anyio
async def test_delete_call(client: AsyncClient) -> None:
    audio = b"\xff\xfb" + b"\x00" * 50
    upload_resp = await client.post("/api/calls", data={"title": "Delete Me"}, files={"file": ("dm.mp3", io.BytesIO(audio), "audio/mpeg")})
    call_id = upload_resp.json()["call_id"]

    resp = await client.delete(f"/api/calls/{call_id}")
    assert resp.status_code == 204

    detail_resp = await client.get(f"/api/calls/{call_id}")
    assert detail_resp.status_code == 404
