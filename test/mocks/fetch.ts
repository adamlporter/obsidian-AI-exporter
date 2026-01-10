import { vi } from 'vitest';

/**
 * Mock Response interface matching fetch Response
 */
interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
  clone: () => MockResponse;
}

/**
 * Options for creating mock responses
 */
interface FetchMockOptions {
  status?: number;
  statusText?: string;
  body?: string | object;
  headers?: Record<string, string>;
}

/**
 * Create a mock Response object
 */
export function createMockResponse(options: FetchMockOptions = {}): MockResponse {
  const { status = 200, statusText = 'OK', body = '', headers = {} } = options;

  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  const responseHeaders = new Headers(headers);

  const response: MockResponse = {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: responseHeaders,
    text: () => Promise.resolve(bodyText),
    json: () =>
      Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    clone: () => createMockResponse(options),
  };

  return response;
}

/**
 * Setup fetch mock with vi.stubGlobal
 * Returns the mock function for configuration
 */
export function setupFetchMock() {
  const mockFetch = vi.fn<
    [input: RequestInfo | URL, init?: RequestInit],
    Promise<Response>
  >();
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

/**
 * Restore original fetch (if needed)
 */
export function restoreFetch() {
  vi.unstubAllGlobals();
}

/**
 * Configure fetch to return success response
 */
export function mockFetchSuccess(
  mockFetch: ReturnType<typeof vi.fn>,
  body: string | object = '',
  options: Omit<FetchMockOptions, 'body'> = {}
) {
  const { status = 200, statusText = 'OK', headers = {} } = options;
  mockFetch.mockResolvedValue(
    createMockResponse({ status, statusText, body, headers }) as unknown as Response
  );
}

/**
 * Configure fetch to return error response (4xx, 5xx)
 */
export function mockFetchError(
  mockFetch: ReturnType<typeof vi.fn>,
  status: number,
  statusText: string,
  body: string | object = ''
) {
  mockFetch.mockResolvedValue(
    createMockResponse({ status, statusText, body }) as unknown as Response
  );
}

/**
 * Configure fetch to throw network error (TypeError)
 */
export function mockFetchNetworkError(
  mockFetch: ReturnType<typeof vi.fn>,
  message = 'Failed to fetch'
) {
  mockFetch.mockRejectedValue(new TypeError(message));
}

/**
 * Configure fetch to throw timeout error (AbortError)
 */
export function mockFetchTimeout(mockFetch: ReturnType<typeof vi.fn>) {
  const error = new DOMException('The operation was aborted', 'AbortError');
  mockFetch.mockRejectedValue(error);
}

/**
 * Configure fetch with multiple sequential responses
 */
export function mockFetchSequence(
  mockFetch: ReturnType<typeof vi.fn>,
  responses: Array<FetchMockOptions | Error>
) {
  responses.forEach((response, index) => {
    if (response instanceof Error) {
      mockFetch.mockRejectedValueOnce(response);
    } else {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(response) as unknown as Response
      );
    }
  });
}

/**
 * Configure fetch to respond based on URL pattern
 */
export function mockFetchByUrl(
  mockFetch: ReturnType<typeof vi.fn>,
  handlers: Record<string, FetchMockOptions | Error | (() => FetchMockOptions | Error)>
) {
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();

    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        const response = typeof handler === 'function' ? handler() : handler;
        if (response instanceof Error) {
          return Promise.reject(response);
        }
        return Promise.resolve(createMockResponse(response) as unknown as Response);
      }
    }

    // Default: 404 Not Found
    return Promise.resolve(
      createMockResponse({ status: 404, statusText: 'Not Found' }) as unknown as Response
    );
  });
}

/**
 * Assert fetch was called with specific URL and options
 */
export function expectFetchCalledWith(
  mockFetch: ReturnType<typeof vi.fn>,
  urlPattern: string | RegExp,
  options?: Partial<RequestInit>
) {
  const calls = mockFetch.mock.calls;
  const matchingCall = calls.find(([url, opts]) => {
    const urlString = typeof url === 'string' ? url : url.toString();
    const urlMatch =
      typeof urlPattern === 'string'
        ? urlString.includes(urlPattern)
        : urlPattern.test(urlString);

    if (!urlMatch) return false;
    if (!options) return true;

    // Check options if provided
    return Object.entries(options).every(([key, value]) => {
      return opts?.[key as keyof RequestInit] === value;
    });
  });

  if (!matchingCall) {
    throw new Error(
      `Expected fetch to be called with URL matching ${urlPattern}` +
        (options ? ` and options ${JSON.stringify(options)}` : '') +
        `\nActual calls: ${JSON.stringify(calls, null, 2)}`
    );
  }
}
