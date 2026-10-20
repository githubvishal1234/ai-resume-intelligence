from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.resumes.content import Experience, Project, ResumeContent
from app.stories.suggest import result_clause, suggest_stories, themes_for
from tests.conftest import login_as
from tests.test_resumes import import_and_confirm

API = "/api/v1/stories"

RESUME = ResumeContent(
    experience=[
        Experience(
            title="Senior Engineer",
            company="Acme",
            bullets=[
                "Led migration of the reporting pipeline, cutting query latency by 40%.",
                "Mentored 3 juniors and resolved a long-running disagreement on API design.",
                "Attended weekly meetings.",
            ],
        )
    ],
    projects=[
        Project(name="Cost Watch", bullets=["Built a tool that saved $12k a year in cloud spend."])
    ],
)


def test_result_is_the_clause_with_a_measured_outcome() -> None:
    assert result_clause("Led migration to PostgreSQL, cutting query latency by 40%.") == (
        "cutting query latency by 40%"
    )
    assert result_clause("Reduced costs by 25% by rightsizing workloads.") == (
        "Reduced costs by 25% by rightsizing workloads"
    )
    assert (
        result_clause("Built a tool that saved $12k a year.")
        == "Built a tool that saved $12k a year"
    )
    assert result_clause("Mentored 3 junior engineers.") == ""  # a count, not an outcome
    assert result_clause("Designed the onboarding flow.") == ""


def test_themes_come_from_explainable_rules() -> None:
    assert themes_for("Led and migrated the pipeline, cutting latency by 40%.") == [
        "leadership", "impact", "technical",
    ]  # fmt: skip
    assert themes_for("Resolved a disagreement between two teams.") == ["conflict", "collaboration"]
    assert themes_for("Mentored 3 junior engineers.") == ["leadership"]  # no measured outcome
    assert themes_for("Attended weekly meetings.") == []


def test_suggestions_quote_the_resume_and_never_invent_situation_or_task() -> None:
    found = suggest_stories(RESUME, used_lines=set())
    lines = [s.line for s in found]
    assert "Attended weekly meetings." not in lines  # no theme, no story
    for s in found:
        assert s.line in {b for e in RESUME.experience for b in e.bullets} | set(
            RESUME.projects[0].bullets
        )
    assert found[0].result  # measurable results come first
    assert found[0].source in {"Senior Engineer at Acme", "Cost Watch"}
    assert not hasattr(found[0], "situation")
    again = suggest_stories(RESUME, used_lines={lines[0]})
    assert lines[0] not in [s.line for s in again]


def test_create_edit_list_and_delete(user_client: TestClient) -> None:
    import_and_confirm(user_client)
    sugg = user_client.get(f"{API}/suggestions").json()
    assert sugg["has_master"] is True and sugg["suggestions"]
    first = sugg["suggestions"][0]
    created = user_client.post(
        API,
        json={
            "title": first["title"],
            "action": first["line"],
            "result": first["result"],
            "themes": first["themes"] + first["themes"][:1],  # duplicates are dropped
            "source_line": first["line"],
            "source": first["source"],
        },
    )
    assert created.status_code == 201, created.text
    story = created.json()
    assert story["situation"] == "" and story["task"] == ""
    assert story["themes"] == first["themes"]
    # A line used for a story is no longer suggested.
    lines = [s["line"] for s in user_client.get(f"{API}/suggestions").json()["suggestions"]]
    assert first["line"] not in lines

    patched = user_client.patch(
        f"{API}/{story['id']}", json={"situation": "Reports took minutes.", "themes": ["impact"]}
    )
    assert patched.status_code == 200
    assert patched.json()["situation"] == "Reports took minutes."
    assert patched.json()["themes"] == ["impact"]
    assert [s["id"] for s in user_client.get(API).json()] == [story["id"]]
    assert user_client.delete(f"{API}/{story['id']}").status_code == 204
    assert user_client.get(API).json() == []


def test_validation_and_no_master(user_client: TestClient) -> None:
    assert user_client.get(f"{API}/suggestions").json() == {
        "method_version": "stories-v1",
        "has_master": False,
        "suggestions": [],
    }
    assert user_client.post(API, json={"title": "  "}).status_code == 422
    assert user_client.post(API, json={"title": "x", "themes": ["bravery"]}).status_code == 422
    assert user_client.post(API, json={"title": "x", "action": "a" * 3001}).status_code == 422


def test_other_users_cannot_see_or_change_a_story(app: FastAPI, user_client: TestClient) -> None:
    story = user_client.post(API, json={"title": "Mine"}).json()
    other = login_as(app, "other@example.com")
    assert other.get(API).json() == []
    assert other.patch(f"{API}/{story['id']}", json={"title": "x"}).status_code == 404
    assert other.delete(f"{API}/{story['id']}").status_code == 404
