import { useEffect, useState } from "react";

import { getDocument, type DocumentRecord } from "../api/documents";
import { formatDate, formatSize, formatType } from "../lib/format";
import { CommentsPanel } from "./CommentsPanel";
import styles from "./DocumentDetail.module.css";

interface Props {
  id: number;
  onBack: () => void;
  notice: string | null;
}

export function DocumentDetail({ id, onBack, notice }: Props) {
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getDocument(id, controller.signal)
      .then(setDocument)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o documento.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, retryKey]);

  return (
    <main className={styles.main}>
      <button className={styles.back} onClick={onBack}>
        ‹ Voltar para documentos
      </button>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {loading && <p className={styles.status}>Carregando documento...</p>}
      {error && (
        <div className={styles.errorArea}>
          <p className="errorMessage" role="alert">
            {error}
          </p>
          <button
            className="button buttonSecondary"
            onClick={() => {
              setError(null);
              setLoading(true);
              setRetryKey((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {document && (
        <div className={styles.layout}>
          <section
            className={styles.documentCard}
            aria-labelledby="document-title"
          >
            <div className={styles.documentHeader}>
              <h1 id="document-title">{document.title}</h1>
              <div className={styles.metadata}>
                <span>{document.original_filename}</span>
                <span>{formatType(document.mime_type)}</span>
                <time dateTime={document.uploaded_at}>
                  {formatDate(document.uploaded_at)}
                </time>
                <span>{formatSize(document.size_bytes)}</span>
              </div>
              {document.description && (
                <p className={styles.description}>{document.description}</p>
              )}
              <div className={styles.actions}>
                <a
                  className="button buttonSecondary"
                  href={document.view_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visualizar arquivo
                </a>
                <a
                  className="button buttonMuted"
                  href={document.download_url}
                  download={document.original_filename}
                >
                  ↓ Baixar arquivo
                </a>
              </div>
            </div>
            <div className={styles.previewArea}>
              {document.mime_type === "application/pdf" ? (
                <iframe
                  className={styles.pdfPreview}
                  src={document.view_url}
                  title={`Prévia de ${document.title}`}
                />
              ) : (
                <img
                  className={styles.imagePreview}
                  src={document.view_url}
                  alt={`Prévia de ${document.title}`}
                />
              )}
            </div>
          </section>
          <CommentsPanel documentId={id} />
        </div>
      )}
    </main>
  );
}
