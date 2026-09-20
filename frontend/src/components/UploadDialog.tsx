import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from "react";

import { uploadDocument } from "../api/documents";
import styles from "./UploadDialog.module.css";

interface Props {
  onClose: () => void;
  onUploaded: (id: number, alreadyExists: boolean) => void;
}

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export function UploadDialog({ onClose, onUploaded }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleEdited = useRef(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    titleRef.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  function chooseFile(candidate: File | null) {
    if (!candidate) return;
    if (
      !ALLOWED_TYPES.includes(candidate.type) ||
      !/\.(pdf|png|jpe?g)$/i.test(candidate.name)
    ) {
      setError("Selecione um arquivo PDF, JPG ou PNG.");
      return;
    }
    if (candidate.size > MAX_SIZE) {
      setError("O arquivo deve ter no máximo 10 MB.");
      return;
    }
    setFile(candidate);
    if (!titleEdited.current) {
      const suggestedTitle = candidate.name
        .replace(/\.(pdf|png|jpe?g)$/i, "")
        .trim();
      setTitle((suggestedTitle || candidate.name).slice(0, 255));
    }
    setError(null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0] ?? null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Selecione um arquivo para continuar.");
      return;
    }
    setSaving(true);
    setError(null);
    const data = new FormData();
    data.set("title", title.trim());
    data.set("description", description.trim());
    data.set("file", file);
    try {
      const result = await uploadDocument(data);
      onUploaded(result.id, result.already_exists);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar o documento.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
      >
        <div className={styles.heading}>
          <h2 id="upload-title">Novo documento</h2>
          <button
            className={styles.close}
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className={styles.fields}>
            <label className="fieldGroup">
              <span>Título do documento *</span>
              <input
                ref={titleRef}
                className="field"
                value={title}
                onChange={(event) => {
                  titleEdited.current = true;
                  setTitle(event.target.value);
                }}
                placeholder="Ex: Contrato de prestação de serviços"
                required
                minLength={1}
                maxLength={255}
              />
            </label>
            <label className="fieldGroup">
              <span>Descrição (opcional)</span>
              <textarea
                className="field"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Adicione uma descrição sobre o documento..."
                maxLength={5000}
                rows={4}
              />
            </label>
            <div className="fieldGroup">
              <span>Arquivo *</span>
              <input
                ref={fileRef}
                className="srOnly"
                type="file"
                aria-label="Arquivo"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) =>
                  chooseFile(event.target.files?.[0] ?? null)
                }
              />
              <div
                className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <span className={styles.uploadIcon} aria-hidden="true">
                  ↑
                </span>
                <span>
                  {file
                    ? file.name
                    : "Arraste um arquivo ou clique para selecionar"}
                </span>
                <small>Formatos aceitos: PDF, JPG ou PNG · até 10 MB</small>
              </div>
            </div>
            {error && (
              <p className="errorMessage" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className={styles.footer}>
            <button
              type="button"
              className="button buttonSecondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="button buttonPrimary"
              disabled={saving}
            >
              {saving ? "Enviando..." : "Salvar documento"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
