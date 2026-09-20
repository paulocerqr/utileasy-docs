import { useEffect, useRef, useState } from "react";

import {
  listDocuments,
  type DocumentKind,
  type DocumentRecord,
} from "../api/documents";
import { formatDate } from "../lib/format";
import { DocumentGrid } from "./DocumentGrid";
import styles from "./DocumentList.module.css";

interface Props {
  onOpen: (id: number) => void;
  refreshKey: number;
}

const PAGE_SIZE = 50;
const VIEW_MODE_KEY = "utileasydoc-document-view";
type ViewMode = "list" | "grid";

function savedViewMode(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === "grid"
      ? "grid"
      : "list";
  } catch {
    return "list";
  }
}

export function DocumentList({ onOpen, refreshKey }: Props) {
  const filterGeneration = useRef(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DocumentKind | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(savedViewMode);
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
    listDocuments(query, 0, kind, controller.signal)
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
  }, [query, kind, refreshKey, retryKey]);

  async function loadMore() {
    const generation = filterGeneration.current;
    setLoadingMore(true);
    try {
      const items = await listDocuments(query, documents.length, kind);
      if (generation !== filterGeneration.current) return;
      setDocuments((current) => [...current, ...items]);
      setHasMore(items.length === PAGE_SIZE);
      setError(null);
    } catch (cause) {
      if (generation !== filterGeneration.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar documentos.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  function changeViewMode(next: ViewMode) {
    setViewMode(next);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, next);
    } catch {
      // A visualização continua ativa nesta sessão sem armazenamento local.
    }
  }

  return (
    <main
      className={`${styles.main} ${viewMode === "grid" ? styles.mainGrid : ""}`}
    >
      <div className={styles.intro}>
        <h1>Documentos</h1>
        <p>
          <p>Repositório de documentos.</p>
        </p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.searchLabel}>
            <span className="srOnly">Buscar documento</span>
            <input
              className="field"
              type="search"
              value={search}
              onChange={(event) => {
                filterGeneration.current += 1;
                setSearch(event.target.value);
                setLoading(true);
              }}
              placeholder="Buscar documento..."
              maxLength={200}
            />
          </label>
          <label className={styles.kindLabel}>
            <span className="srOnly">Tipo de arquivo</span>
            <select
              className="field"
              value={kind ?? ""}
              onChange={(event) => {
                filterGeneration.current += 1;
                setKind((event.target.value || null) as DocumentKind | null);
                setLoading(true);
              }}
            >
              <option value="">Todos os tipos</option>
              <option value="pdf">PDF</option>
              <option value="image">Imagens</option>
            </select>
          </label>
        </div>
        <div
          className={styles.viewSwitcher}
          role="group"
          aria-label="Modo de exibição"
        >
          <button
            className={`${styles.viewButton} ${viewMode === "list" ? styles.viewButtonActive : ""}`}
            type="button"
            aria-label="Exibir em lista"
            aria-pressed={viewMode === "list"}
            onClick={() => changeViewMode("list")}
          >
            <span aria-hidden="true">☰</span>
            <span>Lista</span>
          </button>
          <button
            className={`${styles.viewButton} ${viewMode === "grid" ? styles.viewButtonActive : ""}`}
            type="button"
            aria-label="Exibir em ícones"
            aria-pressed={viewMode === "grid"}
            onClick={() => changeViewMode("grid")}
          >
            <span aria-hidden="true">▦</span>
            <span>Ícones</span>
          </button>
        </div>
      </div>

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

      <div
        className={viewMode === "list" ? styles.list : styles.gridContainer}
        aria-busy={loading}
      >
        {loading ? (
          <p className={styles.status}>Carregando documentos...</p>
        ) : documents.length === 0 ? (
          <p className={styles.status}>
            {query || kind
              ? "Nenhum documento encontrado para esta busca."
              : "Nenhum documento cadastrado ainda."}
          </p>
        ) : viewMode === "grid" ? (
          <DocumentGrid documents={documents} onOpen={onOpen} />
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
