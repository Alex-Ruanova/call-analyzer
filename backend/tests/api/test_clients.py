"""Tests for /api/clients endpoints."""
from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_create_client(client: AsyncClient) -> None:
    resp = await client.post("/api/clients", json={"name": "Acme Corp", "industry": "tech"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Acme Corp"
    assert data["industry"] == "tech"
    assert "id" in data
    assert data["calls"] == 0


@pytest.mark.anyio
async def test_create_client_duplicate(client: AsyncClient) -> None:
    await client.post("/api/clients", json={"name": "Dup Corp"})
    resp = await client.post("/api/clients", json={"name": "Dup Corp"})
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "client_exists"


@pytest.mark.anyio
async def test_list_clients(client: AsyncClient) -> None:
    await client.post("/api/clients", json={"name": "Client A"})
    await client.post("/api/clients", json={"name": "Client B"})

    resp = await client.get("/api/clients")
    assert resp.status_code == 200
    names = [c["name"] for c in resp.json()]
    assert "Client A" in names
    assert "Client B" in names


@pytest.mark.anyio
async def test_get_client_detail(client: AsyncClient) -> None:
    create_resp = await client.post("/api/clients", json={"name": "Detail Corp"})
    client_id = create_resp.json()["id"]

    resp = await client.get(f"/api/clients/{client_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == client_id
    assert data["name"] == "Detail Corp"
    assert "recent_calls" in data
    assert isinstance(data["recent_calls"], list)


@pytest.mark.anyio
async def test_create_then_update_owner(client: AsyncClient) -> None:
    create_resp = await client.post(
        "/api/clients", json={"name": "Owner Corp", "owner": "Maya Chen"}
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["owner"] == "Maya Chen"
    client_id = create_resp.json()["id"]

    # Change
    patch1 = await client.patch(f"/api/clients/{client_id}", json={"owner": "Lee Park"})
    assert patch1.status_code == 200
    assert patch1.json()["owner"] == "Lee Park"

    # Clear (explicit null)
    patch2 = await client.patch(f"/api/clients/{client_id}", json={"owner": None})
    assert patch2.status_code == 200
    assert patch2.json()["owner"] is None

    # Industry untouched when only owner is sent
    patch3 = await client.patch(f"/api/clients/{client_id}", json={"industry": "Retail"})
    assert patch3.status_code == 200
    assert patch3.json()["industry"] == "Retail"
    assert patch3.json()["owner"] is None


@pytest.mark.anyio
async def test_get_client_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/clients/99999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "client_not_found"
