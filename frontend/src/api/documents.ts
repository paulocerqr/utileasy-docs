export interface DocumentRecord {
  id: number;
  title: string;
  description: string | null;
  original_filename: string;
  mime_type: "application/pdf" | "image/png" | "image/jpeg";
  size_bytes: number;
  sha256: string;
  uploaded_at: string;
  view_url: string;
  download_url: string;
}

export interface UploadResult extends DocumentRecord {
  already_exists: boolean;
}

export type DocumentKind = "pdf" | "image";

export interface CommentRecord {
  id: number;
  document_id: number;
  author_name: string;
  content: string;
  created_at: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error(
        "Arquivo grande demais. O limite é de 10 MiB por arquivo.",
      );
    }
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      const wait =
        Number.isFinite(seconds) && seconds > 0
          ? ` Aguarde cerca de ${Math.ceil(seconds / 60)} minuto(s).`
          : " Tente novamente mais tarde.";
      throw new Error(`Limite de uploads atingido.${wait}`);
    }
    const body: unknown = await response.json().catch(() => null);
    const detail =
      body &&
      typeof body === "object" &&
      "detail" in body &&
      typeof body.detail === "string"
        ? body.detail
        : null;
    throw new Error(
      detail ?? `Não foi possível concluir a operação (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}

async function request(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new Error(
      "Não foi possível conectar ao servidor. Verifique sua conexão.",
      { cause },
    );
  }
}

export async function listDocuments(
  search: string,
  offset: number,
  kind: DocumentKind | null,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "50", offset: String(offset) });
  if (search.trim()) params.set("search", search.trim());
  if (kind) params.set("kind", kind);
  const response = await request(`/api/documents?${params}`, { signal });
  return readResponse<DocumentRecord[]>(response);
}

export async function getDocument(id: number, signal?: AbortSignal) {
  const response = await request(`/api/documents/${id}`, { signal });
  return readResponse<DocumentRecord>(response);
}

export async function uploadDocument(data: FormData) {
  const response = await request("/api/documents", {
    method: "POST",
    body: data,
  });
  return readResponse<UploadResult>(response);
}

export async function listComments(
  id: number,
  offset: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "100", offset: String(offset) });
  const response = await request(`/api/documents/${id}/comments?${params}`, {
    signal,
  });
  return readResponse<CommentRecord[]>(response);
}

export async function createComment(
  id: number,
  content: string,
  authorName: string,
) {
  const response = await request(`/api/documents/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, author_name: authorName.trim() || null }),
  });
  return readResponse<CommentRecord>(response);
}
