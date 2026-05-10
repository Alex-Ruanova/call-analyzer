# Phase specs

> **Historical documents.** Each spec was written *before* its phase was implemented and served as the prompt the coding agent ran against. They are intentionally **not** updated to match shipped code — keeping them frozen is what makes the audit trail useful (you can read the spec, then read the diff, and see exactly what the agent built versus what was asked).
>
> Where shipped code diverged from a spec, the divergence is documented in `docs/technical-debt/` (e.g. action-items dropped per #15, sentiment categorical vs. continuous per #01, taxonomy moved to code per #11). The current source of truth for behavior is the README, the code itself, `docs/prompt-design.md`, and `docs/architecture-and-scale.md`.

## Index

| Phase | Spec | Scope |
|---|---|---|
| 1 | [phase-1-backend-foundation](phase-1-backend-foundation.md) | FastAPI app, async SQLAlchemy, Alembic, Celery + Redis, Dockerfiles, compose. |
| 2 | [phase-2-frontend-scaffold](phase-2-frontend-scaffold.md) | Vite + React + TS port of the existing Babel-standalone frontend, TanStack Query, screen routing. |
| 3 | [phase-3-domain-models](phase-3-domain-models.md) | SQLAlchemy models, Pydantic schemas, dashboard aggregates. |
| 4 | [phase-4-analysis-pipeline](phase-4-analysis-pipeline.md) | STT + LLM stages, provider Protocols, prompts, structured outputs. |
| 5 | [phase-5-rest-api](phase-5-rest-api.md) | HTTP endpoints, request/response shapes, error handling, eager-loading rules. |
| 6 | [phase-6-frontend-wiring](phase-6-frontend-wiring.md) | Wire each frontend screen to real endpoints; replace `window.ALTUR` mocks. |
| 6b | [phase-6-remaining](phase-6-remaining.md) | Remaining frontend tasks deferred from phase 6. |
| 7 | [phase-7-tests-docs-makefile](phase-7-tests-docs-makefile.md) | Backend + frontend tests, README, Makefile, prompt-design.md, architecture-and-scale.md. |

## Method

Specs are generated using a dedicated PRD/spec-writer skill, then read line-by-line, audited against intent, and edited until they reflect the decision I want — not the model's first pass. Once approved, `/build` reads the orchestration metadata in the PRD, builds the dependency graph between phases, and dispatches coding agents (sequential when phases depend on each other, in parallel teams when they don't). Each phase output is reviewed against its acceptance criteria before the next phase fires.
