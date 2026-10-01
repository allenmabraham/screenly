export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const STATUS_TEXT: Record<number, string> = {
  400: "bad request",
  401: "unauthorized",
  403: "forbidden",
  404: "not found",
  409: "conflict",
  413: "request too large",
  422: "unprocessable content",
  429: "too many requests",
  500: "internal server error",
  502: "bad gateway",
  503: "service unavailable",
  504: "gateway timeout",
};

export function statusText(status: number) {
  return STATUS_TEXT[status] ?? `HTTP ${status}`;
}

export async function readErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: { message?: unknown };
    };
    const message = body?.error?.message;
    return typeof message === "string" && message ? message : null;
  } catch {
    return null;
  }
}

export function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export class CancellationError extends Error {
  constructor() {
    super("The operation was cancelled.");
    this.name = "CancellationError";
  }
}

export function isCancellation(error: unknown, signal?: AbortSignal) {
  if (error instanceof CancellationError) {
    return true;
  }
  return Boolean(signal?.aborted);
}

export function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new CancellationError();
  }
}

export function sleep(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancellationError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CancellationError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
