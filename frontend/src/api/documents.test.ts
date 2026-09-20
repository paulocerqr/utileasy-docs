import { afterEach, describe, expect, it, vi } from "vitest";

import { listDocuments, uploadDocument } from "./documents";

afterEach(() => vi.unstubAllGlobals());

describe("feedback da API", () => {
  it("envia busca, tipo e paginação na listagem", async () => {
    const fetchMock = vi.fn((input: string) => {
      expect(input).toContain("/api/documents?");
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
    vi.stubGlobal("fetch", fetchMock);

    await listDocuments(" contrato ", 50, "image");

    const url = new URL(String(fetchMock.mock.calls[0][0]), "http://test");
    expect(url.searchParams.get("search")).toBe("contrato");
    expect(url.searchParams.get("kind")).toBe("image");
    expect(url.searchParams.get("offset")).toBe("50");
  });

  it("explica quando o arquivo excede o limite, mesmo se o proxy responder HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 413 })),
    );
    await expect(uploadDocument(new FormData())).rejects.toThrow("10 MiB");
  });

  it("mostra o tempo aproximado de espera do limite por IP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          headers: new Headers({ "Retry-After": "121" }),
        }),
      ),
    );
    await expect(uploadDocument(new FormData())).rejects.toThrow("3 minuto(s)");
  });

  it("traduz falha de conexão", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(uploadDocument(new FormData())).rejects.toThrow(
      "Não foi possível conectar",
    );
  });
});
