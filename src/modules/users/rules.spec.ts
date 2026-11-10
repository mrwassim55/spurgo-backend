import { decideUnlock, isTrialActive, shouldNudge } from './rules';

// Tripoli is UTC+2 all year.
const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00+02:00`);
const shop = { shopOpenHour: 10, shopCloseHour: 16 };

describe('isTrialActive', () => {
  const ends = at('15:00');
  it('active inside shop hours before expiry', () => expect(isTrialActive(ends, shop, at('11:00'))).toBe(true));
  it('inactive before opening', () => expect(isTrialActive(ends, shop, at('09:59'))).toBe(false));
  it('inactive after expiry', () => expect(isTrialActive(ends, shop, at('15:00'))).toBe(false));
  it('inactive after closing even if not expired', () =>
    expect(isTrialActive(at('23:00'), shop, at('16:00'))).toBe(false));
  it('inactive with no trial', () => expect(isTrialActive(null, shop, at('11:00'))).toBe(false));
});

describe('decideUnlock', () => {
  const base = { alreadyUnlocked: false, trialActive: false, hasCredit: false, wantsPoints: false, points: 0, cost: 25 };
  it('order: already > trial > credit > points', () => {
    expect(decideUnlock({ ...base, alreadyUnlocked: true, trialActive: true })).toBe('already');
    expect(decideUnlock({ ...base, trialActive: true, hasCredit: true })).toBe('trial');
    expect(decideUnlock({ ...base, hasCredit: true, wantsPoints: true, points: 99 })).toBe('credit');
    expect(decideUnlock({ ...base, wantsPoints: true, points: 25 })).toBe('points');
  });
  it('points only when asked and affordable', () => {
    expect(decideUnlock({ ...base, points: 99 })).toBe('payment_required');
    expect(decideUnlock({ ...base, wantsPoints: true, points: 24 })).toBe('payment_required');
  });
});

describe('shouldNudge', () => {
  const s = { nudgeMaxCount: 2, nudgeIntervalMinutes: 30 };
  const now = at('12:00');
  const req = { status: 'pending', offersDeadline: at('14:00'), hasOffer: true };
  const t = { status: 'pending', nudges: 0, lastNudgedAt: null };
  it('nudges a silent store once another replied', () => expect(shouldNudge(t, req, s, now)).toBe(true));
  it('never nudges stores that replied or declined', () => {
    expect(shouldNudge({ ...t, status: 'offered' }, req, s, now)).toBe(false);
    expect(shouldNudge({ ...t, status: 'declined' }, req, s, now)).toBe(false);
  });
  it('waits for first reply', () => expect(shouldNudge(t, { ...req, hasOffer: false }, s, now)).toBe(false));
  it('stops on closed request or past deadline', () => {
    expect(shouldNudge(t, { ...req, status: 'completed' }, s, now)).toBe(false);
    expect(shouldNudge(t, { ...req, offersDeadline: at('11:59') }, s, now)).toBe(false);
  });
  it('respects max count and interval', () => {
    expect(shouldNudge({ ...t, nudges: 2 }, req, s, now)).toBe(false);
    expect(shouldNudge({ ...t, nudges: 1, lastNudgedAt: at('11:45') }, req, s, now)).toBe(false);
    expect(shouldNudge({ ...t, nudges: 1, lastNudgedAt: at('11:30') }, req, s, now)).toBe(true);
  });
});
