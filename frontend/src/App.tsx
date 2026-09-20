import { useEffect, useState } from "react";

import { DocumentDetail } from "./components/DocumentDetail";
import { DocumentList } from "./components/DocumentList";
import { UploadDialog } from "./components/UploadDialog";
import { useTheme } from "./lib/useTheme";
import styles from "./App.module.css";

function documentIdFromPath() {
  const match = /^\/documents\/(\d+)\/?$/.exec(window.location.pathname);
  return match ? Number(match[1]) : null;
}

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [documentId, setDocumentId] = useState(documentIdFromPath);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncPath = () => setDocumentId(documentIdFromPath());
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  function navigate(id: number | null) {
    window.history.pushState(null, "", id === null ? "/" : `/documents/${id}`);
    setDocumentId(id);
    setNotice(null);
    window.scrollTo(0, 0);
  }

  return (
    <div className={styles.appShell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a
            className={styles.brand}
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigate(null);
            }}
          >
            UtileasyDoc
          </a>
          <div className={styles.headerActions}>
            <button
              className="button buttonSecondary"
              type="button"
              onClick={toggleTheme}
              aria-label={
                theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"
              }
              title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
              <span className={styles.themeLabel}>
                {theme === "dark" ? "Modo claro" : "Modo escuro"}
              </span>
            </button>
            <button
              className="button buttonPrimary"
              onClick={() => setUploadOpen(true)}
            >
              Novo documento
            </button>
          </div>
        </div>
      </header>

      {documentId === null ? (
        <DocumentList onOpen={navigate} refreshKey={refreshKey} />
      ) : (
        <DocumentDetail
          key={documentId}
          id={documentId}
          onBack={() => navigate(null)}
          notice={notice}
        />
      )}

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onUploaded={(id, alreadyExists) => {
            setUploadOpen(false);
            setRefreshKey((value) => value + 1);
            navigate(id);
            if (alreadyExists) {
              setNotice(
                "Este arquivo já estava cadastrado. Exibindo o documento existente.",
              );
            }
          }}
        />
      )}
    </div>
  );
}
