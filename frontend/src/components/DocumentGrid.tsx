import type { DocumentRecord } from "../api/documents";
import { formatDate, formatType } from "../lib/format";
import styles from "./DocumentGrid.module.css";

interface Props {
  documents: DocumentRecord[];
  onOpen: (id: number) => void;
}

export function DocumentGrid({ documents, onOpen }: Props) {
  return (
    <div className={styles.grid} aria-label="Documentos em ícones">
      {documents.map((document) => (
        <article className={styles.card} key={document.id}>
          <button
            className={styles.openButton}
            type="button"
            aria-label={document.title}
            onClick={() => onOpen(document.id)}
          >
            <span className={styles.fileIcon} aria-hidden="true">
              <svg viewBox="0 0 48 56" fill="none">
                <path
                  d="M7 2h23l11 11v38a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Z"
                  fill="var(--color-surface)"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path d="M30 2v11h11" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span
                className={`${styles.badge} ${
                  document.mime_type === "application/pdf"
                    ? styles.badgePdf
                    : styles.badgeImage
                }`}
              >
                {formatType(document.mime_type)}
              </span>
            </span>
            <span className={styles.title} title={document.title}>
              {document.title}
            </span>
            <time className={styles.date} dateTime={document.uploaded_at}>
              {formatDate(document.uploaded_at)}
            </time>
          </button>
          <div className={styles.actions}>
            <a
              href={document.view_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visualizar ${document.title}`}
              title="Visualizar"
            >
              ↗
            </a>
            <a
              href={document.download_url}
              download={document.original_filename}
              aria-label={`Baixar ${document.title}`}
              title="Baixar"
            >
              ↓
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
