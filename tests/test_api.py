"""API tests against the running stack: BASE_URL=http://localhost:3000 pytest tests/"""
import os
import uuid

import requests

BASE = os.getenv("BASE_URL", "http://localhost:3000")
YT = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"


def new_user(password="Secret123!"):
    email = f"t_{uuid.uuid4().hex[:10]}@Example.com"
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email, "password": password, "display_name": "בודק"})
    assert r.status_code == 201, r.text
    assert set(r.json()) >= {"id", "email", "display_name"} and "password" not in r.text
    tok = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}).json()
    assert tok["token_type"] == "bearer" and tok["expires_in"] == 3600
    return email, {"Authorization": f"Bearer {tok['access_token']}"}


def test_health():
    r = requests.get(f"{BASE}/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_register_errors():
    email, _ = new_user()
    r = requests.post(f"{BASE}/api/auth/register", json={"email": email.upper(), "password": "Secret123!", "display_name": "x"})
    assert r.status_code == 409 and isinstance(r.json()["detail"], str)
    r = requests.post(f"{BASE}/api/auth/register", json={"email": "a@b.co", "password": "short", "display_name": "x"})
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)
    r = requests.post(f"{BASE}/api/auth/register", json={"email": "nope", "password": "longenough", "display_name": "x"})
    assert r.status_code == 422


def test_login_wrong_and_rate_limit():
    email, _ = new_user()
    for _ in range(5):
        assert requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "wrongpass"}).status_code == 401
    assert requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "wrongpass"}).status_code == 429


def test_me_logout_and_auth_required():
    _, h = new_user()
    assert requests.get(f"{BASE}/api/users/me").status_code == 401
    me = requests.get(f"{BASE}/api/users/me", headers=h).json()
    assert me["display_name"] == "בודק" and "created_at" in me
    assert requests.patch(f"{BASE}/api/users/me", json={"display_name": "חדש"}, headers=h).json()["display_name"] == "חדש"
    assert requests.post(f"{BASE}/api/auth/logout", headers=h).status_code == 204
    assert requests.get(f"{BASE}/api/users/me", headers=h).status_code == 401


def test_password_change_invalidates_old_tokens():
    email, h = new_user()
    r = requests.post(f"{BASE}/api/users/me/password", json={"current_password": "bad", "new_password": "NewSecret123"}, headers=h)
    assert r.status_code == 400
    r = requests.post(f"{BASE}/api/users/me/password", json={"current_password": "Secret123!", "new_password": "NewSecret123"}, headers=h)
    assert r.status_code == 204
    assert requests.get(f"{BASE}/api/users/me", headers=h).status_code == 401
    assert requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "NewSecret123"}).status_code == 200


def test_content_crud_and_isolation():
    _, a = new_user()
    _, b = new_user()
    r = requests.post(f"{BASE}/api/content", json={"type": "youtube", "title": "סרטון", "source": YT, "bed": "מדע"}, headers=a)
    assert r.status_code == 201 and r.json()["youtube_id"] == "aqz-KE-bpKQ"
    cid = r.json()["id"]
    assert requests.post(f"{BASE}/api/content", json={"type": "youtube", "title": "x", "source": "https://evil.com/x"}, headers=a).status_code == 422
    assert requests.post(f"{BASE}/api/content", json={"type": "web", "title": "x", "source": "javascript:alert(1)"}, headers=a).status_code == 422
    assert requests.post(f"{BASE}/api/content", json={"type": "text", "title": "t", "source": "שלום עולם"}, headers=a).status_code == 201
    assert len(requests.get(f"{BASE}/api/content", headers=a).json()) == 2
    assert requests.get(f"{BASE}/api/content", headers=b).json() == []
    assert requests.get(f"{BASE}/api/content/{cid}", headers=b).status_code == 404
    assert requests.delete(f"{BASE}/api/content/{cid}", headers=b).status_code == 404
    assert requests.get(f"{BASE}/api/content/not-an-id", headers=a).status_code == 404
    assert requests.delete(f"{BASE}/api/content/{cid}", headers=a).status_code == 204
    assert requests.get(f"{BASE}/api/content/{cid}", headers=a).status_code == 404


def test_sessions_flow():
    _, a = new_user()
    _, b = new_user()
    cid = requests.post(f"{BASE}/api/content", json={"type": "text", "title": "קריאה", "source": "abc"}, headers=a).json()["id"]
    s = requests.post(f"{BASE}/api/sessions", json={"content_id": cid}, headers=a)
    assert s.status_code == 201
    sid = s.json()["id"]
    assert requests.post(f"{BASE}/api/sessions", json={"content_id": cid}, headers=b).status_code == 404
    for sc in (0.2, 0.8):
        assert requests.post(f"{BASE}/api/sessions/{sid}/readings", json={"position": 3, "score": sc}, headers=a).status_code == 201
    assert requests.post(f"{BASE}/api/sessions/{sid}/readings", json={"position": 3, "score": 1.5}, headers=a).status_code == 422
    assert requests.post(f"{BASE}/api/sessions/{sid}/readings", json={"position": 3, "score": 0.5}, headers=b).status_code == 404
    end = requests.post(f"{BASE}/api/sessions/{sid}/end", headers=a).json()
    assert end["reading_count"] == 2 and abs(end["average_score"] - 0.5) < 1e-6 and end["ended_at"]
    assert requests.post(f"{BASE}/api/sessions/{sid}/readings", json={"position": 3, "score": 0.5}, headers=a).status_code == 409
    lst = requests.get(f"{BASE}/api/sessions", headers=a).json()
    assert lst[0]["content_title"] == "קריאה" and lst[0]["average_score"] == 0.5
    one = requests.get(f"{BASE}/api/sessions/{sid}", headers=a).json()
    assert len(one["readings"]) == 2
    assert requests.get(f"{BASE}/api/sessions/{sid}", headers=b).status_code == 404


def test_delete_account():
    email, h = new_user()
    requests.post(f"{BASE}/api/content", json={"type": "text", "title": "t", "source": "x"}, headers=h)
    assert requests.delete(f"{BASE}/api/users/me", headers=h).status_code == 204
    assert requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": "Secret123!"}).status_code == 401


def test_growth_garden_journal_badges():
    import time
    _, h = new_user()
    cid = requests.post(f"{BASE}/api/content", json={"type": "youtube", "title": "גדילה", "source": YT, "bed": "מדע"}, headers=h).json()["id"]
    sid = requests.post(f"{BASE}/api/sessions", json={"content_id": cid}, headers=h).json()["id"]
    last = None
    for sc in (0.9, 0.9, 0.2, 0.9):
        time.sleep(1.1)
        last = requests.post(f"{BASE}/api/sessions/{sid}/readings", json={"position": 1, "score": sc, "attention": [0.01] * 100}, headers=h).json()
    assert {"level", "stage", "blooms", "focused_seconds"} <= set(last)
    assert 2.5 < last["focused_seconds"] < 4.5  # the 0.2 reading did not count as focus
    end = requests.post(f"{BASE}/api/sessions/{sid}/end", headers=h).json()
    assert end["species"] == "sunflower"
    g = requests.get(f"{BASE}/api/garden", headers=h).json()
    assert g["total_plants"] == 1 and g["beds"][0]["name"] == "מדע" and g["beds"][0]["plants"][0]["session_id"] == sid
    j = requests.get(f"{BASE}/api/journal?tz_offset=-120", headers=h).json()
    assert len(j["minutes_by_day"]) == 14 and j["by_bed"][0]["name"] == "מדע" and j["tips"]
    assert len(j["attention_strips"][0]["weights"]) == 100
    b = requests.get(f"{BASE}/api/badges", headers=h).json()
    assert b["season"]["name"] and any(x["id"] == "first_seed" and x["earned"] for x in b["badges"])
    assert requests.get(f"{BASE}/api/garden").status_code == 401
