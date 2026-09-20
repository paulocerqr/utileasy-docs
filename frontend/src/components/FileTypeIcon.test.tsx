import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FileTypeIcon } from "./FileTypeIcon";

afterEach(cleanup);

describe("FileTypeIcon", () => {
  it.each([
    ["application/pdf", "PDF"],
    ["image/png", "PNG"],
    ["image/jpeg", "JPG"],
  ] as const)("identifica %s com %s", (mimeType, label) => {
    render(<FileTypeIcon mimeType={mimeType} compact />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
