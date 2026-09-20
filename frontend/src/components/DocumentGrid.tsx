import type { DocumentRecord } from "../api/documents";
import { formatDate } from "../lib/format";
import { FileTypeIcon } from "./FileTypeIcon";
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
          <a
            className={styles.openLink}
            href={`/documents/${document.id}`}
            aria-label={`Abrir ${document.title}`}
            onClick={(event) => {
              if (
                event.button === 0 &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.shiftKey &&
                !event.altKey
              ) {
                event.preventDefault();
                onOpen(document.id);
              }
            }}
          />
          <div className={styles.content}>
            <FileTypeIcon mimeType={document.mime_type} />
            <span className={styles.title} title={document.title}>
              {document.title}
            </span>
            <time className={styles.date} dateTime={document.uploaded_at}>
              {formatDate(document.uploaded_at)}
            </time>
          </div>
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
