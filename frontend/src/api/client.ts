/// <reference types="vite/client" />
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    const err = body?.error as Record<string, unknown> | undefined;
    throw new ApiError(
      res.status,
      (err?.message as string | undefined) ?? res.statusText,
      err?.code as string | undefined,
      err?.details,
    );
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export function apiUpload<T>(
  path: string,
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}${path}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (xhr.status === 204 || xhr.getResponseHeader("content-length") === "0") {
          resolve(undefined as T);
          return;
        }
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new ApiError(xhr.status, "Invalid JSON response"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText) as Record<string, unknown>;
          const err = body?.error as Record<string, unknown> | undefined;
          reject(new ApiError(
            xhr.status,
            (err?.message as string | undefined) ?? xhr.statusText,
            err?.code as string | undefined,
            err?.details,
          ));
        } catch {
          reject(new ApiError(xhr.status, xhr.statusText));
        }
      }
    };

    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.ontimeout = () => reject(new ApiError(0, "Request timed out"));

    // Do NOT set Content-Type — browser sets it with multipart boundary from FormData
    xhr.send(formData);
  });
}
