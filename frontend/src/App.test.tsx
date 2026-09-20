import {
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
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
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
