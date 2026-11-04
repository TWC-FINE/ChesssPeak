import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';

// Runs against the local _test database (pnpm test:integration refuses anything else).
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Seat = Partial<{ whiteGuestId: string; whiteUserId: string; blackGuestId: string; blackUserId: string }>;
const guests = (): Seat => ({ whiteGuestId: randomUUID(), blackGuestId: randomUUID() });
const names = { whiteName: 'Ana', blackName: 'Luis' };
const create = (data: Record<string, unknown>) => prisma.game.create({ data: { ...names, ...data } as never });

/** The insert must fail on this CHECK constraint, not on anything else. */
const rejectedBy = async (constraint: string | string[], data: Record<string, unknown>) => {
  const accepted = Array.isArray(constraint) ? constraint : [constraint];
  const error = await create(data).then(
    () => undefined,
    (e: unknown) => e as Error,
  );
  if (error === undefined) throw new Error(`expected ${accepted.join(' or ')} to reject ${JSON.stringify(data)}`);
  const text = String(error.message) + JSON.stringify(error);
  if (!accepted.some((name) => text.includes(name))) throw new Error(`expected ${accepted.join(' or ')} but got: ${text.slice(0, 300)}`);
};

beforeEach(async () => {
  await prisma.game.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.game.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe('games CHECK constraints (real Postgres)', () => {
  describe('accepts valid combinations', () => {
    it('waiting with one seat taken', async () => {
      await expect(create({ status: 'waiting', whiteGuestId: randomUUID(), blackName: null })).resolves.toBeDefined();
    });

    it('waiting with both seats taken (e.g. just before becoming active)', async () => {
      await expect(create({ status: 'waiting', ...guests() })).resolves.toBeDefined();
    });

    it('active with two guests, and with a registered user against a guest', async () => {
      await expect(create({ status: 'active', ...guests() })).resolves.toBeDefined();
      const user = await prisma.user.create({ data: { username: 'ana', passwordHash: 'x' } });
      await expect(create({ status: 'active', whiteUserId: user.id, blackGuestId: randomUUID() })).resolves.toBeDefined();
    });

    it('finished with a real result and a termination', async () => {
      for (const [result, termination] of [['1-0', 'checkmate'], ['0-1', 'resignation'], ['1/2-1/2', 'stalemate']]) {
        await expect(create({ status: 'finished', ...guests(), result, termination, finishedAt: new Date() })).resolves.toBeDefined();
      }
    });

    it('aborted with a single seat (nobody joined)', async () => {
      await expect(create({ status: 'aborted', whiteGuestId: randomUUID(), blackName: null, result: '*', termination: 'aborted', finishedAt: new Date() })).resolves.toBeDefined();
    });
  });

  describe('rejects invalid combinations', () => {
    it('both user_id and guest_id for the same color', async () => {
      const user = await prisma.user.create({ data: { username: 'luis', passwordHash: 'x' } });
      await rejectedBy('games_white_one_identity', { status: 'waiting', whiteUserId: user.id, whiteGuestId: randomUUID() });
      await rejectedBy('games_black_one_identity', { status: 'waiting', whiteGuestId: randomUUID(), blackUserId: user.id, blackGuestId: randomUUID() });
    });

    it('active or finished with a missing seat', async () => {
      await rejectedBy('games_seats_by_status', { status: 'active', whiteGuestId: randomUUID() });
      await rejectedBy('games_seats_by_status', { status: 'finished', blackGuestId: randomUUID(), result: '1-0', termination: 'checkmate' });
    });

    it('waiting or aborted with no seat at all', async () => {
      await rejectedBy('games_seats_by_status', { status: 'waiting' });
      await rejectedBy('games_seats_by_status', { status: 'aborted', result: '*', termination: 'aborted' });
    });

    it('finished without a real result or without termination, or with termination aborted', async () => {
      await rejectedBy('games_outcome_by_status', { status: 'finished', ...guests(), result: '*', termination: 'checkmate' });
      await rejectedBy('games_outcome_by_status', { status: 'finished', ...guests(), result: null, termination: 'checkmate' });
      await rejectedBy('games_outcome_by_status', { status: 'finished', ...guests(), result: '1-0', termination: null });
      await rejectedBy('games_outcome_by_status', { status: 'finished', ...guests(), result: '1-0', termination: 'aborted' });
    });

    it('aborted with a real result, or without termination aborted', async () => {
      const one = { whiteGuestId: randomUUID() };
      await rejectedBy('games_outcome_by_status', { status: 'aborted', ...one, result: '1-0', termination: 'aborted' });
      await rejectedBy('games_outcome_by_status', { status: 'aborted', ...one, result: '*', termination: 'resignation' });
      await rejectedBy('games_outcome_by_status', { status: 'aborted', ...one, result: null, termination: null });
    });

    it('waiting or active with a result or a termination', async () => {
      await rejectedBy('games_outcome_by_status', { status: 'waiting', whiteGuestId: randomUUID(), result: '1-0' });
      await rejectedBy('games_outcome_by_status', { status: 'active', ...guests(), termination: 'checkmate' });
    });

    it('values outside the allowed lists', async () => {
      // a bad value also breaks the status/outcome link, and Postgres reports whichever check it evaluates first
      await rejectedBy(['games_result_values', 'games_outcome_by_status'], { status: 'finished', ...guests(), result: '2-0', termination: 'checkmate' });
      await rejectedBy(['games_termination_values', 'games_outcome_by_status'], { status: 'finished', ...guests(), result: '1-0', termination: 'boredom' });
    });
  });
});
