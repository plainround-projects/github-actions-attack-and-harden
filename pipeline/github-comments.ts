import { COMMENT_MARKER } from "./build-result.js";

/** The slice of the GitHub REST API this tool needs, so tests can replace it. */
export interface Comments {
  list(repository: string, pr: number): Promise<{ id: number; body: string }[]>;
  create(repository: string, pr: number, body: string): Promise<void>;
  update(repository: string, commentId: number, body: string): Promise<void>;
}

/** Create the comment, or update the one this tool wrote earlier; returns what it did. */
export async function upsertComment(
  api: Comments,
  repository: string,
  pr: number,
  body: string,
): Promise<"created" | "updated"> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`not a repository name: ${JSON.stringify(repository.slice(0, 80))}`);
  }
  const existing = (await api.list(repository, pr)).find((comment) => comment.body.startsWith(COMMENT_MARKER));
  if (existing) {
    await api.update(repository, existing.id, body);
    return "updated";
  }
  await api.create(repository, pr, body);
  return "created";
}

/** GitHub answered with an error status. A 4xx is the caller's mistake and is not retried. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface HttpOptions {
  readonly token: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly attempts?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** GitHub REST over fetch with a timeout on every call and exponential backoff on network errors and 5xx answers. */
export class GitHubComments implements Comments {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly attempts: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: HttpOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.github.com";
    this.fetchFn = options.fetchFn ?? fetch;
    this.attempts = options.attempts ?? 3;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async list(repository: string, pr: number): Promise<{ id: number; body: string }[]> {
    const response = await this.request("GET", `/repos/${repository}/issues/${pr}/comments?per_page=100`);
    return (await response.json()) as { id: number; body: string }[];
  }

  async create(repository: string, pr: number, body: string): Promise<void> {
    await this.request("POST", `/repos/${repository}/issues/${pr}/comments`, { body });
  }

  async update(repository: string, commentId: number, body: string): Promise<void> {
    await this.request("PATCH", `/repos/${repository}/issues/comments/${commentId}`, { body });
  }

  private async request(method: string, path: string, payload?: unknown): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      try {
        const init: RequestInit = {
          method,
          headers: {
            Authorization: `Bearer ${this.options.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(payload === undefined ? {} : { "Content-Type": "application/json" }),
          },
          signal: AbortSignal.timeout(this.timeoutMs),
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        };
        const response = await this.fetchFn(`${this.baseUrl}${path}`, init);
        if (response.ok) return response;
        throw new HttpError(response.status, `GitHub answered ${response.status} to ${method} ${path}`);
      } catch (error) {
        if (error instanceof HttpError && error.status < 500) throw error;
        lastError = error;
      }
      if (attempt < this.attempts) await this.sleep(2 ** (attempt - 1) * 500);
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
