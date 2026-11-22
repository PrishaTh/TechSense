export class ApiError extends Error {
  status: number;
  blocked: boolean;
  constructor(message: string, status: number, blocked = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.blocked = blocked;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const body = (payload ?? {}) as { error?: string; blocked?: boolean };
    throw new ApiError(
      body.error ?? `Request failed (${response.status})`,
      response.status,
      body.blocked === true,
    );
  }

  return payload as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
