import type { DocumentRecord } from "../api/documents";
import { formatType } from "../lib/format";
import styles from "./FileTypeIcon.module.css";

interface Props {
  mimeType: DocumentRecord["mime_type"];
  compact?: boolean;
}

export function FileTypeIcon({ mimeType, compact = false }: Props) {
  return (
    <span
      className={`${styles.icon} ${compact ? styles.compact : ""}`}
      aria-hidden="true"
    >
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
          mimeType === "application/pdf" ? styles.badgePdf : styles.badgeImage
        }`}
      >
        {formatType(mimeType)}
      </span>
    </span>
  );
}
