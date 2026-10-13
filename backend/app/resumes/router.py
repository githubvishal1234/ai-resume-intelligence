from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.deps import CurrentAuth
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.models import Resume, ResumeImport, ResumeVersion
from app.resumes.analysis import METHOD_VERSION, analyze
from app.resumes.content import ResumeContent
from app.resumes.extraction import UploadTooLarge
from app.resumes.schemas import (
    AnalysisOut,
    CheckOut,
    ConfirmImportIn,
    CreateResumeIn,
    ImportOut,
    ImportReportOut,
    RenameIn,
    RestoreIn,
    ResumeDetailOut,
    ResumeSummaryOut,
    UpdateContentIn,
    VersionMetaOut,
    VersionOut,
)
from app.resumes.service import ResumeService
from app.storage.base import get_storage

router = APIRouter(prefix="/resumes", tags=["resumes"])


def get_resume_service(
    request: Request,
    auth: CurrentAuth,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ResumeService:
    return ResumeService(
        db,
        settings,
        get_storage(settings),
        auth.actor,
        request.scope.get("state", {}).get("request_id"),
    )


Service = Annotated[ResumeService, Depends(get_resume_service)]


def _detail(resume: Resume, version: ResumeVersion) -> ResumeDetailOut:
    summary = ResumeSummaryOut.model_validate(resume)
    return ResumeDetailOut(
        **summary.model_dump(), content=ResumeContent.model_validate(version.content)
    )


def _import_out(item: ResumeImport, service: ResumeService) -> ImportOut:
    return ImportOut(
        id=item.id,
        status=item.status,
        filename=item.file.original_filename,
        created_at=item.created_at,
        content=ResumeContent.model_validate(item.parsed),
        report=ImportReportOut.model_validate(item.report),
        has_master=service.active_master() is not None,
        ai_available=service.ai_available(),
    )


def _meta(v: ResumeVersion) -> VersionMetaOut:
    return VersionMetaOut(
        version=v.version,
        source=v.source,
        note=v.note,
        has_file=v.file_id is not None,
        created_at=v.created_at,
    )


# ---- imports ---------------------------------------------------------------------------
@router.post("/imports", response_model=ImportOut, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    service: Service,
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File(description="PDF, DOCX or TXT resume")],
) -> ImportOut:
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise UploadTooLarge(
            f"The file is larger than {settings.max_upload_bytes // (1024 * 1024)} MB."
        )
    item = service.create_import(file.filename or "resume", data)
    return _import_out(item, service)


@router.get("/imports/{import_id}", response_model=ImportOut)
def get_import(import_id: uuid.UUID, service: Service) -> ImportOut:
    item = service.get_import(import_id)
    return _import_out(item, service)


@router.post("/imports/{import_id}/confirm", response_model=ResumeDetailOut)
def confirm_import(
    import_id: uuid.UUID, body: ConfirmImportIn, service: Service, response: Response
) -> ResumeDetailOut:
    resume, version, created = service.confirm_import(import_id, body.content, body.title)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return _detail(resume, version)


@router.post("/imports/{import_id}/ai-parse", response_model=ImportOut)
def ai_parse_import(import_id: uuid.UUID, service: Service) -> ImportOut:
    return _import_out(service.ai_parse_import(import_id), service)


@router.delete("/imports/{import_id}/ai-parse", response_model=ImportOut)
def undo_ai_parse(import_id: uuid.UUID, service: Service) -> ImportOut:
    return _import_out(service.undo_ai_parse(import_id), service)


@router.post("/imports/{import_id}/discard", status_code=status.HTTP_204_NO_CONTENT)
def discard_import(import_id: uuid.UUID, service: Service) -> None:
    service.discard_import(import_id)


# ---- resumes ---------------------------------------------------------------------------
@router.get("", response_model=list[ResumeSummaryOut])
def list_resumes(service: Service) -> list[ResumeSummaryOut]:
    return [ResumeSummaryOut.model_validate(r) for r in service.list_resumes()]


@router.post("", response_model=ResumeDetailOut, status_code=status.HTTP_201_CREATED)
def create_resume(body: CreateResumeIn, service: Service) -> ResumeDetailOut:
    return _detail(*service.create_master(body.title, body.content))


@router.get("/{resume_id}", response_model=ResumeDetailOut)
def get_resume(resume_id: uuid.UUID, service: Service) -> ResumeDetailOut:
    return _detail(*service.get(resume_id))


@router.patch("/{resume_id}", response_model=ResumeSummaryOut)
def rename_resume(resume_id: uuid.UUID, body: RenameIn, service: Service) -> ResumeSummaryOut:
    return ResumeSummaryOut.model_validate(service.rename(resume_id, body.title))


@router.put("/{resume_id}/content", response_model=ResumeDetailOut)
def update_content(
    resume_id: uuid.UUID, body: UpdateContentIn, service: Service
) -> ResumeDetailOut:
    return _detail(*service.update_content(resume_id, body.base_version, body.content, body.note))


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resume(resume_id: uuid.UUID, service: Service) -> None:
    service.delete(resume_id)


@router.get("/{resume_id}/versions", response_model=list[VersionMetaOut])
def list_versions(resume_id: uuid.UUID, service: Service) -> list[VersionMetaOut]:
    return [_meta(v) for v in service.versions(resume_id)]


@router.get("/{resume_id}/versions/{version}", response_model=VersionOut)
def get_version(resume_id: uuid.UUID, version: int, service: Service) -> VersionOut:
    v = service.version(resume_id, version)
    return VersionOut(**_meta(v).model_dump(), content=ResumeContent.model_validate(v.content))


@router.get("/{resume_id}/versions/{version}/file", response_class=Response)
def download_version_file(resume_id: uuid.UUID, version: int, service: Service) -> Response:
    file, data = service.version_file(resume_id, version)
    return Response(
        content=data,
        media_type=file.media_type,
        headers={
            "content-disposition": f'attachment; filename="{file.original_filename}"',
        },
    )


@router.post("/{resume_id}/versions/{version}/restore", response_model=ResumeDetailOut)
def restore_version(
    resume_id: uuid.UUID, version: int, body: RestoreIn, service: Service
) -> ResumeDetailOut:
    return _detail(*service.restore(resume_id, version, body.base_version))


@router.get("/{resume_id}/analysis", response_model=AnalysisOut)
def resume_analysis(resume_id: uuid.UUID, service: Service) -> AnalysisOut:
    resume, version = service.get(resume_id)
    score, checks = analyze(ResumeContent.model_validate(version.content))
    return AnalysisOut(
        resume_id=resume.id,
        version=version.version,
        score=score,
        method_version=METHOD_VERSION,
        checks=[CheckOut(**c.__dict__) for c in checks],
    )
