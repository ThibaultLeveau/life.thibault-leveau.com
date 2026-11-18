"""An actual workspace receipt can feed ten fresh specialists in one turn."""

import json
from uuid import uuid4

import pytest
from test_assistant import ScriptedSession, admitted, conversation, events
from test_assistant import client as client

from life_app.apps.life_ai.runtime import Runtime
from life_app.platform.assistant.providers import ProviderError, Response


def call(name, args):
    return {"id": str(uuid4()), "name": name, "arguments": json.dumps(args)}


@pytest.mark.parametrize("separate_rounds", [False, True])
def test_workspace_then_ten_specialists_use_real_receipts(app, client, separate_rounds):
    class Delegations(ScriptedSession):
        created = []

        def respond(self, tools):
            self.turn += 1
            names = {tool["name"] for tool in tools}
            if "delegate_tasks" in names:
                if self.turn == 1:
                    return Response(calls=[call("delegate_tasks", {"task": "workspace"})])
                if self.turn == 2 or (separate_rounds and self.turn <= 11):
                    receipt = self.results[0]["operations"][0]
                    assert receipt["status"] == "complete"
                    space_id = receipt["created_or_changed"][0]["id"]
                    indices = [self.turn - 2] if separate_rounds else range(10)
                    return Response(
                        calls=[
                            call(
                                "delegate_tasks",
                                {
                                    "task": json.dumps(
                                        {"workspace_id": space_id, "title": f"Task {i}"}
                                    )
                                },
                            )
                            for i in indices
                        ]
                    )
            elif self.turn == 1:
                return Response(
                    calls=[
                        call(
                            "load_tools",
                            {
                                "names": [
                                    "create_workspace"
                                    if self.messages[0]["content"] == "workspace"
                                    else "create_task"
                                ]
                            },
                        )
                    ]
                )
            elif self.turn == 2:
                task = self.messages[0]["content"]
                return Response(
                    calls=[
                        call(
                            "create_workspace" if task == "workspace" else "create_task",
                            {
                                "arguments": {
                                    "payload": {"name": "Eleven agents"}
                                    if task == "workspace"
                                    else json.loads(task)
                                }
                            },
                        )
                    ]
                )
            yield "Terminé."
            return Response(text="Terminé.")

    app.state.assistant_provider_factory = Delegations
    id = conversation(client)
    payload = {"content": "Crée un espace puis dix tâches distinctes.", "request_id": str(uuid4())}
    output = events(client.post(f"/api/v1/assistant/conversations/{id}/messages", json=payload))
    assert not [event for event in output if event["type"] == "error"], output
    assert len(Delegations.created) == 12  # coordinator + 1 workspace + 10 task agents
    assert client.get("/api/v1/tasks").json()["total"] == 10
    assert len(client.get("/api/v1/workspaces").json()) == 1
    assert (
        client.get(f"/api/v1/assistant/conversations/{id}").json()["messages"][-1]["status"]
        == "complete"
    )
    events(client.post(f"/api/v1/assistant/conversations/{id}/messages", json=payload))
    assert client.get("/api/v1/tasks").json()["total"] == 10


def test_action_budget_preserves_completed_work(app, client):
    class RepeatedAction(ScriptedSession):
        def respond(self, tools):
            self.turn += 1
            if self.turn == 1:
                return Response(calls=[call("load_tools", {"names": ["create_workspace"]})])
            return Response(
                calls=[
                    call(
                        "create_workspace",
                        {"arguments": {"payload": {"name": f"Space {self.turn}"}}},
                    )
                ]
            )
            yield

    app.state.settings.assistant_max_actions = 2
    app.state.assistant_provider_factory = RepeatedAction
    run_id, _ = admitted(app, client)
    runtime = Runtime(app, run_id)
    with pytest.raises(ProviderError, match="budget_reached"):
        list(runtime.specialist("tasks", "Create workspaces"))
    assert len(client.get("/api/v1/workspaces").json()) == 2
