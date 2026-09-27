export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiErrorBody {
  error?: {
    message?: string;
    code?: string;
  };
}

export function parseApiError(status: number, body: unknown): ApiError {
  const parsed = body as ApiErrorBody | null;
  return new ApiError(
    status,
    parsed?.error?.message ?? "Erro desconhecido.",
    parsed?.error?.code,
  );
}
