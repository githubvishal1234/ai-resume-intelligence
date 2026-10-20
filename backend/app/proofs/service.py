"""Proof tasks: plans to create real evidence for a missing skill, tracked to done.

"Done" is the user's word that the work is finished. Whether it counts as evidence is a
separate, computed fact: `evidence_status` checks the master resume with the matching
rules on every read, so the board never claims a gap is closed until the resume shows it.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Actor, ensure_access
from app.core.errors import AppError, NotFound
from app.matching.matcher import _Index, _index, _skill_status
from app.models import Job, ProofTask, Resume, ResumeVersion
from app.proofs.schemas import CreateProofIn, ProofOut, UpdateProofIn
from app.proofs.suggestions import suggest
from app.resumes.content import ResumeContent


class ProofExists(AppError):
    status_code = 409
    code = "PROOF_EXISTS"
    message = "You already have a proof task for this skill."


class ProofService:
    def __init__(self, db: Session, actor: Actor) -> None:
        self.db = db
        self.actor = actor

    def _owned(self, proof_id: uuid.UUID) -> ProofTask:
        task = self.db.get(ProofTask, proof_id)
        if task is None:
            raise NotFound()
        ensure_access(self.actor, task.owner_id)
        return task

    def _master_index(self) -> _Index | None:
        """The master resume's skill index, or None without a master resume."""
        content = self.db.scalar(
            select(ResumeVersion.content)
            .join(Resume, Resume.id == ResumeVersion.resume_id)
            .where(
                Resume.owner_id == self.actor.user_id,
                Resume.kind == "master",
                Resume.status == "active",
                ResumeVersion.version == Resume.current_version,
            )
        )
        if content is None:
            return None
        return _index(ResumeContent.model_validate(content))

    def _out(self, tasks: list[ProofTask]) -> list[ProofOut]:
        index = self._master_index()
        out = []
        for t in tasks:
            o = ProofOut.model_validate(t)
            o.evidence_status = _skill_status(index, t.skill)[0] if index is not None else None
            out.append(o)
        return out

    def list(self) -> list[ProofOut]:
        tasks = self.db.scalars(
            select(ProofTask)
            .where(ProofTask.owner_id == self.actor.user_id)
            .order_by(ProofTask.updated_at.desc())
        ).all()
        return self._out(list(tasks))

    def create(self, body: CreateProofIn) -> ProofOut:
        if body.job_id is not None:
            job = self.db.get(Job, body.job_id)
            if job is None:
                raise NotFound()
            ensure_access(self.actor, job.owner_id)
        exists = self.db.scalar(
            select(ProofTask.id).where(
                ProofTask.owner_id == self.actor.user_id, ProofTask.skill == body.skill
            )
        )
        if exists is not None:
            raise ProofExists()
        options = {s.kind: s for s in suggest(body.skill)}
        chosen = options.get(body.kind) or next(iter(options.values()))
        task = ProofTask(
            owner_id=self.actor.user_id,
            job_id=body.job_id,
            skill=body.skill,
            kind=chosen.kind,
            title=chosen.title,
            plan="\n".join(chosen.plan),
            status="todo",
        )
        self.db.add(task)
        self.db.commit()
        return self._out([task])[0]

    def update(self, proof_id: uuid.UUID, body: UpdateProofIn) -> ProofOut:
        task = self._owned(proof_id)
        for name in ("title", "plan", "status"):
            value = getattr(body, name)
            if value is not None:
                setattr(task, name, value)
        self.db.commit()
        return self._out([task])[0]

    def delete(self, proof_id: uuid.UUID) -> None:
        self.db.delete(self._owned(proof_id))
        self.db.commit()
