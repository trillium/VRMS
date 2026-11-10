import { describe, expect, it } from 'vitest';
import { DEFAULT_PROD_API_BASE_URL, getWorkerApiBaseUrl } from './apiBaseUrl.js';

describe('getWorkerApiBaseUrl', () => {
  it('keeps calling the public site in prod when nothing is configured', () => {
    expect(getWorkerApiBaseUrl({ NODE_ENV: 'prod', BACKEND_PORT: '4000' })).toBe(
      DEFAULT_PROD_API_BASE_URL,
    );
    expect(DEFAULT_PROD_API_BASE_URL).toBe('https://www.vrms.io');
  });

  it('calls localhost outside prod when nothing is configured', () => {
    expect(getWorkerApiBaseUrl({ NODE_ENV: 'test', BACKEND_PORT: '4000' })).toBe(
      'http://localhost:4000',
    );
  });

  it('uses WORKER_API_BASE_URL in prod, so a non-Hack-for-LA deploy never calls vrms.io', () => {
    const url = getWorkerApiBaseUrl({
      NODE_ENV: 'prod',
      BACKEND_PORT: '4000',
      WORKER_API_BASE_URL: 'http://backend:4000',
    });
    expect(url).toBe('http://backend:4000');
  });

  it('trims whitespace and trailing slashes, and ignores a blank value', () => {
    expect(getWorkerApiBaseUrl({ WORKER_API_BASE_URL: ' http://backend:4000/ ' })).toBe(
      'http://backend:4000',
    );
    expect(getWorkerApiBaseUrl({ NODE_ENV: 'prod', WORKER_API_BASE_URL: '  ' })).toBe(
      DEFAULT_PROD_API_BASE_URL,
    );
  });
});
