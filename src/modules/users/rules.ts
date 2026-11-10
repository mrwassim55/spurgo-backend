// Every admin-tunable value, persisted in SystemConfig (key = setting name).
export const DEFAULT_SETTINGS = {
  signupPoints: 10,
  consumptionRate: 25, // points needed to unlock one store contact
  trialHours: 4,
  shopOpenHour: 10, // Africa/Tripoli local time
  shopCloseHour: 16,
  responseWindowMinutes: 120, // how long a request accepts offers
  nudgeMaxCount: 2,
  nudgeIntervalMinutes: 30,
  maxTargetStores: 0, // 0 = every matching store
  // Points table (client doc §8 / §8.1)
  'pts.customer.paid': 10,
  'pts.customer.rating': 5,
  'pts.store.decline': 5,
  'pts.store.offer': 10,
  'pts.store.sale': 25,
  'pts.store.ratingRequest': 10,
  'pts.store.rated': 5,
};

export type Settings = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof Settings;

// Ledger reason -> settings key holding its amount.
export const AWARDS = {
  signup: 'signupPoints',
  paid: 'pts.customer.paid',
  customer_rating: 'pts.customer.rating',
  decline: 'pts.store.decline',
  offer: 'pts.store.offer',
  sale: 'pts.store.sale',
  rating_request: 'pts.store.ratingRequest',
  rated: 'pts.store.rated',
} as const satisfies Record<string, SettingKey>;

export type AwardReason = keyof typeof AWARDS;

export function tripoliHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Tripoli',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
}

// Trial = expires trialHours after signup AND only usable during shop hours.
export function isTrialActive(
  trialEndsAt: Date | string | null | undefined,
  s: Pick<Settings, 'shopOpenHour' | 'shopCloseHour'>,
  now = new Date(),
): boolean {
  if (!trialEndsAt || now >= new Date(trialEndsAt)) return false;
  const h = tripoliHour(now);
  return h >= s.shopOpenHour && h < s.shopCloseHour;
}

export type UnlockDecision = 'already' | 'trial' | 'credit' | 'points' | 'payment_required';

export function decideUnlock(o: {
  alreadyUnlocked: boolean;
  trialActive: boolean;
  hasCredit: boolean;
  wantsPoints: boolean;
  points: number;
  cost: number;
}): UnlockDecision {
  if (o.alreadyUnlocked) return 'already';
  if (o.trialActive) return 'trial';
  if (o.hasCredit) return 'credit';
  if (o.wantsPoints && o.points >= o.cost) return 'points';
  return 'payment_required';
}

// Nudge a store that hasn't answered, once someone else has, within limits.
export function shouldNudge(
  target: { status: string; nudges: number; lastNudgedAt?: Date | null },
  request: { status: string; offersDeadline?: Date | null; hasOffer: boolean },
  s: Pick<Settings, 'nudgeMaxCount' | 'nudgeIntervalMinutes'>,
  now = new Date(),
): boolean {
  if (target.status !== 'pending' || request.status !== 'pending') return false;
  if (!request.hasOffer) return false;
  if (request.offersDeadline && now >= new Date(request.offersDeadline)) return false;
  if (target.nudges >= s.nudgeMaxCount) return false;
  if (!target.lastNudgedAt) return true;
  return now.getTime() - new Date(target.lastNudgedAt).getTime() >= s.nudgeIntervalMinutes * 60_000;
}

export const NUDGE_MESSAGE =
  'تم استلام استجابة من أحد المتاجر لهذا الطلب. بادر بإرسال ردك بسرعة';
