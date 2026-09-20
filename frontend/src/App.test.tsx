import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const document = {
  id: 7,
  title: "Contrato de serviços",
  description: "Documento de teste",
  original_filename: "contrato.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024,
  sha256: "a".repeat(64),
  uploaded_at: "2026-09-19T12:00:00Z",
  view_url: "/api/documents/7/file",
  download_url: "/api/documents/7/download",
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  window.document.documentElement.removeAttribute("data-theme");
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("exibe documentos em ícones e mantém o modo escolhido", async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input === "/api/documents/7")
        return Promise.resolve(jsonResponse(document));
      if (input.startsWith("/api/documents/7/comments"))
        return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse([document]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstVisit = render(<App />);
    await screen.findByRole("button", { name: "Contrato de serviços" });
    fireEvent.click(screen.getByRole("button", { name: "Exibir em ícones" }));

    expect(screen.getByLabelText("Documentos em ícones")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exibir em ícones" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("link", { name: "Baixar Contrato de serviços" }),
    ).toHaveAttribute("href", document.download_url);
    expect(window.localStorage.getItem("utileasydoc-document-view")).toBe(
      "grid",
    );

    firstVisit.unmount();
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Contrato de serviços" }),
    );
    expect(window.location.pathname).toBe("/documents/7");
  });

  it("filtra PDFs e imagens junto com a busca textual", async () => {
    const image = {
      ...document,
      id: 8,
      title: "Foto do contrato",
      original_filename: "foto.png",
      mime_type: "image/png",
    };
    const fetchMock = vi.fn((input: string) => {
      const params = new URL(input, "http://test").searchParams;
      const items = [document, image].filter((item) => {
        const kind = params.get("kind");
        const search = params.get("search");
        return (
          (!kind ||
            (kind === "pdf"
              ? item.mime_type === "application/pdf"
              : item.mime_type.startsWith("image/"))) &&
          (!search || item.title.toLowerCase().includes(search.toLowerCase()))
        );
      });
      return Promise.resolve(jsonResponse(items));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(
      await screen.findByRole("button", { name: "Foto do contrato" }),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Tipo de arquivo" }),
      {
        target: { value: "pdf" },
      },
    );
    expect(
      await screen.findByRole("button", { name: "Contrato de serviços" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Foto do contrato" }),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Tipo de arquivo" }),
      {
        target: { value: "image" },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("Buscar documento..."), {
      target: { value: "foto" },
    });
    expect(
      await screen.findByRole("button", { name: "Foto do contrato" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(
          /kind=image.*search=foto|search=foto.*kind=image/,
        ),
        expect.anything(),
      ),
    );
  });

  it("alterna o tema e mantém a escolha em visitas futuras", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    const firstVisit = render(<App />);
    expect(window.document.documentElement).toHaveAttribute(
      "data-theme",
      "light",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ativar modo escuro" }));
    expect(window.document.documentElement).toHaveAttribute(
      "data-theme",
      "dark",
    );
    expect(window.localStorage.getItem("utileasydoc-theme")).toBe("dark");

    firstVisit.unmount();
    render(<App />);
    expect(window.document.documentElement).toHaveAttribute(
      "data-theme",
      "dark",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ativar modo claro" }));
    expect(window.document.documentElement).toHaveAttribute(
      "data-theme",
      "light",
    );
    expect(window.localStorage.getItem("utileasydoc-theme")).toBe("light");
  });

  it("usa a preferência de tema do sistema quando não há escolha salva", () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: (
        _event: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => listeners.add(listener),
      removeEventListener: (
        _event: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => listeners.delete(listener),
    }));

    render(<App />);
    expect(window.document.documentElement).toHaveAttribute(
      "data-theme",
      "dark",
    );
    act(() => {
      listeners.forEach((listener) =>
        listener({ matches: false } as MediaQueryListEvent),
      );
    });
    expect(window.document.documentElement).toHaveAttribute(
      "data-theme",
      "light",
    );
  });

  it("sugere o nome original como título sem substituir uma edição manual", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Novo documento" }));
    const title = screen.getByPlaceholderText(
      "Ex: Contrato de prestação de serviços",
    );
    const file = screen.getByLabelText("Arquivo");

    fireEvent.change(file, {
      target: {
        files: [
          new File(["pdf"], "Contrato final.pdf", { type: "application/pdf" }),
        ],
      },
    });
    expect(title).toHaveValue("Contrato final");

    fireEvent.change(title, { target: { value: "Contrato revisado" } });
    fireEvent.change(file, {
      target: {
        files: [new File(["png"], "Anexo.png", { type: "image/png" })],
      },
    });
    expect(title).toHaveValue("Contrato revisado");
  });

  it("mostra documentos e abre o detalhe com histórico", async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith("/api/documents/7/comments"))
        return Promise.resolve(jsonResponse([]));
      if (input === "/api/documents/7")
        return Promise.resolve(jsonResponse(document));
      return Promise.resolve(jsonResponse([document]));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.getByText("UtileasyDoc")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Documentos" }),
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "Contrato de serviços" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Contrato de serviços" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Comentários" }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Prévia de Contrato de serviços")).toHaveAttribute(
      "src",
      document.view_url,
    );
    expect(window.location.pathname).toBe("/documents/7");
  });

  it("envia documento e informa quando o hash já existe", async () => {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      if (input === "/api/documents" && init?.method === "POST") {
        return Promise.resolve(
          jsonResponse({ ...document, already_exists: true }),
        );
      }
      if (input === "/api/documents/7")
        return Promise.resolve(jsonResponse(document));
      if (input.startsWith("/api/documents/7/comments"))
        return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse([]));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Novo documento" }));
    fireEvent.change(
      screen.getByPlaceholderText("Ex: Contrato de prestação de serviços"),
      {
        target: { value: "Contrato de serviços" },
      },
    );
    fireEvent.change(screen.getByLabelText("Arquivo"), {
      target: {
        files: [
          new File(["%PDF-1.7\n%%EOF"], "contrato.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar documento" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "já estava cadastrado",
      ),
    );
    expect(window.location.pathname).toBe("/documents/7");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("publica comentário e atualiza o histórico", async () => {
    window.history.replaceState(null, "", "/documents/7");
    const comment = {
      id: 3,
      document_id: 7,
      author_name: "Anônimo",
      content: "Conferido",
      created_at: "2026-09-19T13:00:00Z",
    };
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      if (input === "/api/documents/7/comments" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(comment, 201));
      }
      if (input.startsWith("/api/documents/7/comments"))
        return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse(document));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    fireEvent.change(
      await screen.findByPlaceholderText("Escreva um comentário..."),
      {
        target: { value: "Conferido" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Comentar" }));

    expect(await screen.findByText("Conferido")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/7/comments",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
