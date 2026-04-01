import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../../src/lib/retry.js';
import { NetworkError, RateLimitError, AuthenticationError } from '../../src/lib/errors.js';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, { initialDelay: 100 });

    // Fast-forward past the delay
    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new AuthenticationError());

    await expect(withRetry(fn)).rejects.toThrow(AuthenticationError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new NetworkError());

    const promise = withRetry(fn, { maxRetries: 2, initialDelay: 100 });

    // Run all timers to completion and catch the expected rejection
    let error: Error | null = null;
    promise.catch(e => { error = e; });

    await vi.runAllTimersAsync();

    // Wait for the promise to settle
    await expect(promise).rejects.toThrow(NetworkError);
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('calls onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, { onRetry, initialDelay: 100 });

    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.any(NetworkError),
      1,
      expect.any(Number)
    );
  });

  it('respects maxDelay', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new NetworkError())
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, {
      onRetry,
      initialDelay: 1000,
      maxDelay: 500,
      maxRetries: 2,
    });

    await vi.runAllTimersAsync();
    await promise;

    // All delays should be capped at maxDelay (with some jitter)
    for (const call of onRetry.mock.calls) {
      expect(call[2]).toBeLessThanOrEqual(500);
    }
  });

  it('uses custom shouldRetry function', async () => {
    const shouldRetry = vi.fn().mockReturnValue(true);
    const fn = vi.fn()
      .mockRejectedValueOnce(new AuthenticationError())
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, { shouldRetry, initialDelay: 100 });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(shouldRetry).toHaveBeenCalledWith(expect.any(AuthenticationError));
  });

  it('uses rate limit reset time when available', async () => {
    vi.useRealTimers(); // Use real timers for this test

    const resetAt = new Date(Date.now() + 100); // 100ms from now
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new RateLimitError(resetAt))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      onRetry,
      initialDelay: 10,
      maxDelay: 60000,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

