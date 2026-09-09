import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { AuditLogInterceptor } from './audit-log.interceptor';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../types/authenticated-user';

interface RequestOverrides {
  method?: string;
  url?: string;
  routePath?: string;
  body?: unknown;
  params?: Record<string, string>;
  user?: AuthenticatedUser;
}

function buildContext(overrides: RequestOverrides = {}): ExecutionContext {
  const request = {
    method: overrides.method ?? 'POST',
    url: overrides.url ?? '/api/v1/auth/login',
    originalUrl: overrides.url ?? '/api/v1/auth/login',
    route: { path: overrides.routePath ?? '/api/v1/auth/login' },
    body: overrides.body ?? {},
    params: overrides.params ?? {},
    ip: '127.0.0.1',
    user: overrides.user,
    get: (header: string) => (header.toLowerCase() === 'user-agent' ? 'jest' : undefined),
  };

  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode: 201 }),
    }),
  } as unknown as ExecutionContext;
}

const nextHandler: CallHandler = { handle: () => of({ ok: true }) };

/** Lets the `void this.write(...)` fire-and-forget promise settle. */
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('AuditLogInterceptor', () => {
  let interceptor: AuditLogInterceptor;
  let create: jest.Mock;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const prisma = { auditLog: { create } } as unknown as PrismaService;
    interceptor = new AuditLogInterceptor(prisma);
  });

  function lastRow(): Record<string, unknown> {
    const call = create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    return call.data;
  }

  it('writes a row for a mutating request', async () => {
    const context = buildContext({ method: 'POST', body: { email: 'a@b.com' } });

    await lastValueFrom(interceptor.intercept(context, nextHandler));
    await flushMicrotasks();

    expect(create).toHaveBeenCalledTimes(1);
    expect(lastRow()).toMatchObject({
      action: 'POST /api/v1/auth/login',
      resourceType: 'auth',
      statusCode: 201,
    });
  });

  it.each(['PUT', 'PATCH', 'DELETE'])('writes a row for %s', async (method) => {
    const context = buildContext({ method });

    await lastValueFrom(interceptor.intercept(context, nextHandler));
    await flushMicrotasks();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not write a row for a GET request', async () => {
    const context = buildContext({ method: 'GET' });

    await lastValueFrom(interceptor.intercept(context, nextHandler));
    await flushMicrotasks();

    expect(create).not.toHaveBeenCalled();
  });

  it('redacts password and token fields from the persisted metadata', async () => {
    const context = buildContext({
      body: {
        email: 'admin@example.com',
        password: 'super-secret',
        refreshToken: 'eyJhbGciOi',
        accessToken: 'eyJhbGciOi',
        nested: { newPassword: 'also-secret', keep: 'visible' },
      },
    });

    await lastValueFrom(interceptor.intercept(context, nextHandler));
    await flushMicrotasks();

    const metadata = lastRow().metadata as { body: Record<string, unknown> };
    const body = metadata.body;

    expect(body.password).toBe('[REDACTED]');
    expect(body.refreshToken).toBe('[REDACTED]');
    expect(body.accessToken).toBe('[REDACTED]');
    expect(body.email).toBe('admin@example.com');

    const nested = body.nested as Record<string, unknown>;
    expect(nested.newPassword).toBe('[REDACTED]');
    expect(nested.keep).toBe('visible');

    // Belt and braces: no secret should appear anywhere in the serialised row.
    expect(JSON.stringify(lastRow())).not.toContain('super-secret');
    expect(JSON.stringify(lastRow())).not.toContain('also-secret');
  });

  it('records an unauthenticated mutation with a null actor rather than throwing', async () => {
    const context = buildContext({ user: undefined });

    await expect(lastValueFrom(interceptor.intercept(context, nextHandler))).resolves.toEqual({
      ok: true,
    });
    await flushMicrotasks();

    expect(lastRow()).toMatchObject({
      actorUserId: null,
      branchId: null,
      departmentId: null,
    });
  });

  it('copies branch and department scoping from the authenticated user', async () => {
    const context = buildContext({
      routePath: '/api/v1/tickets/:id',
      params: { id: 'ticket-9' },
      method: 'PATCH',
      user: {
        sub: 'user-1',
        email: 'agent@example.com',
        role: 'agent',
        userType: 'staff',
        branchId: 'branch-1',
        departmentId: 'dept-1',
      },
    });

    await lastValueFrom(interceptor.intercept(context, nextHandler));
    await flushMicrotasks();

    expect(lastRow()).toMatchObject({
      actorUserId: 'user-1',
      branchId: 'branch-1',
      departmentId: 'dept-1',
      resourceType: 'tickets',
      resourceId: 'ticket-9',
      action: 'PATCH /api/v1/tickets/:id',
    });
  });

  it('does not fail the request when the audit write itself fails', async () => {
    create.mockRejectedValue(new Error('database is down'));
    const context = buildContext();

    await expect(lastValueFrom(interceptor.intercept(context, nextHandler))).resolves.toEqual({
      ok: true,
    });
    await flushMicrotasks();
  });
});
