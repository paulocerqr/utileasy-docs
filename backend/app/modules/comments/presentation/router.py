import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from starlette.concurrency import run_in_threadpool

from app.infrastructure.database.session import SessionFactory
from app.modules.comments.application.manage_comments import (
    CommentValidationError,
    DocumentNotFoundError,
    ManageComments,
)
from app.modules.comments.infrastructure.unit_of_work import SqlAlchemyCommentUnitOfWork
from app.modules.comments.presentation.schemas import CommentResponse, CreateCommentRequest

router = APIRouter(prefix="/documents/{document_id}/comments", tags=["comments"])
logger = logging.getLogger(__name__)


def get_manage_comments() -> ManageComments:
    return ManageComments(lambda: SqlAlchemyCommentUnitOfWork(SessionFactory))


@router.post("", response_model=CommentResponse, status_code=201)
async def create_comment(
    document_id: Annotated[int, Path(gt=0)],
    payload: CreateCommentRequest,
    service: Annotated[ManageComments, Depends(get_manage_comments)],
) -> CommentResponse:
    try:
        comment = await run_in_threadpool(
            service.create, document_id, payload.content, payload.author_name
        )
    except DocumentNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except CommentValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    logger.info("Comentário criado: documento=%s comentário=%s", document_id, comment.id)
    return CommentResponse.from_comment(comment)


@router.get("", response_model=list[CommentResponse])
async def list_comments(
    document_id: Annotated[int, Path(gt=0)],
    service: Annotated[ManageComments, Depends(get_manage_comments)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[CommentResponse]:
    try:
        comments = await run_in_threadpool(service.list, document_id, limit, offset)
    except DocumentNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return [CommentResponse.from_comment(comment) for comment in comments]
