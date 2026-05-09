/**
 * UploadScreen — happy path test.
 * Verifies that selecting a file and a client then clicking "Analyze" fires
 * the useCreateCall mutation with a FormData containing the file and client_id.
 *
 * Uses vi.mock to stub the hooks layer — avoids real network calls and keeps
 * the test focused on the component's form-submission behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UploadScreen from "../screens/UploadScreen";

// ---- Mock hooks ----

const mockMutate = vi.fn();
const mockCreateCall = { mutate: mockMutate, isPending: false };
const mockUseClients = { data: [{ id: "1", name: "Acme Corp", industry: "Tech", owner: null, calls: 0, last_call: null, sentiment: null, health: null, arr: null }] };

vi.mock("../api/hooks", () => ({
  useClients: () => mockUseClients,
  useCreateCall: () => mockCreateCall,
  useCreateClient: () => ({ mutate: vi.fn() }),
}));

// ---- Helpers ----

function renderUpload() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <UploadScreen />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function makeAudioFile(name = "call.mp3"): File {
  return new File([new Uint8Array(100)], name, { type: "audio/mpeg" });
}

// ---- Tests ----

describe("UploadScreen", () => {
  beforeEach(() => {
    mockMutate.mockReset();
  });

  it("renders the upload dropzone", () => {
    renderUpload();
    expect(screen.getByText(/drop your audio/i)).toBeInTheDocument();
  });

  it("shows client picker after file is selected", async () => {
    renderUpload();
    const file = makeAudioFile();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    await waitFor(() => {
      expect(screen.getByText(/assign to a client/i)).toBeInTheDocument();
    });
  });

  it("calls useCreateCall.mutate with FormData when Analyze is clicked", async () => {
    renderUpload();

    // Select file via the hidden file input
    const file = makeAudioFile();
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    // Open client picker and select "Acme Corp"
    await waitFor(() => screen.getByRole("button", { name: /choose client/i }));
    fireEvent.click(screen.getByRole("button", { name: /choose client/i }));
    await waitFor(() => screen.getByText("Acme Corp"));
    fireEvent.click(screen.getByText("Acme Corp"));

    // Click Analyze — wait for button to become enabled
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /analyze/i });
      expect(btn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledOnce());

    const callArgs = mockMutate.mock.calls[0][0] as { formData: FormData; onProgress: unknown };
    expect(callArgs.formData).toBeInstanceOf(FormData);
    expect(callArgs.formData.get("client_id")).toBe("1");
    expect(callArgs.formData.get("file")).toBeInstanceOf(File);
    expect(typeof callArgs.onProgress).toBe("function");
  });
});
