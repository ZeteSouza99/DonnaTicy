"use client";

import { parseApiError } from "./api-error";

export { ApiError } from "./api-error";

const ACCOUNT_PAGE = "/dashboard/configuracoes/conta";

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function clientFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  const response = await fetch(path, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...customHeaders,
    },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const error = parseApiError(response.status, errorBody);
    if (error.code === "PASSWORD_CHANGE_REQUIRED" && window.location.pathname !== ACCOUNT_PAGE) {
      window.location.assign(ACCOUNT_PAGE);
    }
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
