import { useEffect, useState, type FormEvent } from "react";

import {
  createComment,
  listComments,
  type CommentRecord,
} from "../api/documents";
import { formatDateTime } from "../lib/format";
import styles from "./CommentsPanel.module.css";

interface Props {
  documentId: number;
}

const PAGE_SIZE = 100;

export function CommentsPanel({ documentId }: Props) {
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loadedCount, setLoadedCount] = useState(0);
  const [authorName, setAuthorName] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listComments(documentId, 0, controller.signal)
      .then((items) => {
        setComments(items);
        setLoadedCount(items.length);
        setHasMore(items.length === PAGE_SIZE);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar comentários.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [documentId, retryKey]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const items = await listComments(documentId, loadedCount);
      setComments((current) => {
        const knownIds = new Set(current.map((comment) => comment.id));
        return [
          ...current,
          ...items.filter((comment) => !knownIds.has(comment.id)),
        ];
      });
      setLoadedCount((current) => current + items.length);
      setHasMore(items.length === PAGE_SIZE);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar comentários.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createComment(
        documentId,
        content.trim(),
        authorName,
      );
      setComments((current) => [...current, created]);
      setContent("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar o comentário.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="comments-title">
      <h2 id="comments-title">Comentários</h2>
      <div className={styles.history} aria-live="polite">
        {error && !loading && comments.length === 0 && (
          <button
            className="button buttonSecondary"
            onClick={() => {
              setError(null);
              setLoading(true);
              setRetryKey((value) => value + 1);
            }}
          >
            Tentar carregar comentários
          </button>
        )}
        {loading ? (
          <p className={styles.status}>Carregando comentários...</p>
        ) : comments.length === 0 ? (
          <p className={styles.status}>
            Nenhum comentário ainda. Seja o primeiro a comentar.
          </p>
        ) : (
          comments.map((comment) => (
            <article className={styles.comment} key={comment.id}>
              <span className={styles.avatar} aria-hidden="true">
                {comment.author_name.slice(0, 1).toUpperCase()}
              </span>
              <div className={styles.commentBody}>
                <strong>{comment.author_name}</strong>
                <time dateTime={comment.created_at}>
                  {formatDateTime(comment.created_at)}
                </time>
                <p>{comment.content}</p>
              </div>
            </article>
          ))
        )}
        {hasMore && (
          <button
            className="button buttonSecondary"
            onClick={() => {
              void loadMore();
            }}
            disabled={loadingMore}
          >
            {loadingMore ? "Carregando..." : "Ver comentários anteriores"}
          </button>
        )}
      </div>
      <form
        className={styles.form}
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <label className="fieldGroup">
          <span>Seu nome (opcional)</span>
          <input
            className="field"
            value={authorName}
            onChange={(event) => setAuthorName(event.target.value)}
            maxLength={100}
            placeholder="Anônimo"
          />
        </label>
        <label className="fieldGroup">
          <span>Comentário</span>
          <textarea
            className="field"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Escreva um comentário..."
            required
          />
        </label>
        {error && (
          <p className="errorMessage" role="alert">
            {error}
          </p>
        )}
        <button
          className="button buttonPrimary"
          type="submit"
          disabled={saving || !content.trim()}
        >
          {saving ? "Enviando..." : "Comentar"}
        </button>
      </form>
    </section>
  );
}
