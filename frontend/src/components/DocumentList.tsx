import { useEffect, useState } from "react";

import { listDocuments, type DocumentRecord } from "../api/documents";
import { formatDate } from "../lib/format";
import styles from "./DocumentList.module.css";

interface Props {
  onOpen: (id: number) => void;
  refreshKey: number;
}

const PAGE_SIZE = 50;

export function DocumentList({ onOpen, refreshKey }: Props) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    listDocuments(query, 0, controller.signal)
      .then((items) => {
        setDocuments(items);
        setHasMore(items.length === PAGE_SIZE);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar documentos.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, refreshKey, retryKey]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const items = await listDocuments(query, documents.length);
      setDocuments((current) => [...current, ...items]);
      setHasMore(items.length === PAGE_SIZE);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar documentos.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.intro}>
        <h1>Documentos</h1>
        <p>
          Repositório de documentos.
        </p>
      </div>

      <label className={styles.searchLabel}>
        <span className="srOnly">Buscar documento</span>
        <input
          className="field"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLoading(true);
          }}
          placeholder="Buscar documento..."
          maxLength={200}
        />
      </label>

      {error && (
        <div className={styles.errorArea}>
          <p className="errorMessage" role="alert">
            {error}
          </p>
          <button
            className="button buttonSecondary"
            onClick={() => {
              setLoading(true);
              setRetryKey((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className={styles.list} aria-busy={loading}>
        {loading ? (
          <p className={styles.status}>Carregando documentos...</p>
        ) : documents.length === 0 ? (
          <p className={styles.status}>
            {query
              ? "Nenhum documento encontrado para esta busca."
              : "Nenhum documento cadastrado ainda."}
          </p>
        ) : (
          documents.map((document) => (
            <article className={styles.row} key={document.id}>
              <span className={styles.fileIcon} aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 1.5h5l3 3V14H4V1.5Z" fill="currentColor" />
                  <path d="M9 1.5v3h3" stroke="#f3f5f6" strokeWidth="1.2" />
                </svg>
              </span>
              <div className={styles.fileInfo}>
                <button
                  className={styles.titleButton}
                  onClick={() => onOpen(document.id)}
                >
                  {document.title}
                </button>
                <span className={styles.filename}>
                  {document.original_filename}
                </span>
              </div>
              <time className={styles.date} dateTime={document.uploaded_at}>
                {formatDate(document.uploaded_at)}
              </time>
              <div className={styles.actions}>
                <a
                  className="button buttonSecondary"
                  href={document.view_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visualizar
                </a>
                <a
                  className="button buttonMuted"
                  href={document.download_url}
                  download={document.original_filename}
                >
                  ↓ <span>Baixar</span>
                </a>
              </div>
            </article>
          ))
        )}
      </div>

      {hasMore && !loading && (
        <button
          className="button buttonSecondary"
          onClick={() => {
            void loadMore();
          }}
          disabled={loadingMore}
        >
          {loadingMore ? "Carregando..." : "Carregar mais"}
        </button>
      )}
    </main>
  );
}
