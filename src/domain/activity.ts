import type { Activity, DayOpeningHours, PriceDetails, WeeklyOpeningHours } from './types';
import { weekdays } from './types';

export function emptyDayOpeningHours(): DayOpeningHours {
  return { closed: false, allDay: false, intervals: [], note: '' };
}

export function emptyWeeklyOpeningHours(): WeeklyOpeningHours {
  return Object.fromEntries(weekdays.map((day) => [day, emptyDayOpeningHours()])) as WeeklyOpeningHours;
}

export function emptyPriceDetails(currency = 'GBP'): PriceDetails {
  return {
    kind: 'Desconocido',
    adult: 0,
    child: 0,
    baby: 0,
    family: 0,
    totalEstimate: 0,
    currency,
    unit: 'persona',
    note: '',
  };
}

export function richActivityDefaults(): Pick<
  Activity,
  | 'planType'
  | 'openingHours'
  | 'specialHours'
  | 'openingHoursNote'
  | 'priceDetails'
  | 'reservationStatus'
  | 'bookingDeadline'
  | 'cancellationPolicy'
  | 'meetingPoint'
  | 'accessibility'
  | 'strollerFriendly'
  | 'familyFriendly'
  | 'minimumAge'
  | 'rainPlan'
  | 'environment'
  | 'documents'
  | 'sourceName'
  | 'sourceUrl'
  | 'verificationStatus'
  | 'lastVerifiedAt'
  | 'verificationNote'
  | 'tourProvider'
  | 'tourLanguage'
  | 'tourType'
  | 'tipGuidance'
  | 'restaurantCuisine'
  | 'mealType'
  | 'dietaryOptions'
  | 'bookingPlatform'
  | 'leisureType'
  | 'showTime'
  | 'venue'
> {
  return {
    planType: 'Principal',
    openingHours: emptyWeeklyOpeningHours(),
    specialHours: '',
    openingHoursNote: '',
    priceDetails: emptyPriceDetails(),
    reservationStatus: 'No necesaria',
    bookingDeadline: '',
    cancellationPolicy: '',
    meetingPoint: '',
    accessibility: '',
    strollerFriendly: false,
    familyFriendly: true,
    minimumAge: '',
    rainPlan: '',
    environment: 'Sin indicar',
    documents: [],
    sourceName: '',
    sourceUrl: '',
    verificationStatus: 'Pendiente de verificar',
    lastVerifiedAt: '',
    verificationNote: '',
    tourProvider: '',
    tourLanguage: '',
    tourType: '',
    tipGuidance: '',
    restaurantCuisine: '',
    mealType: '',
    dietaryOptions: '',
    bookingPlatform: '',
    leisureType: '',
    showTime: '',
    venue: '',
  };
}

export function completeActivity(activity: Activity): Activity {
  const defaults = richActivityDefaults();
  const storedPrice = (activity as Partial<Activity>).priceDetails;
  return {
    ...defaults,
    ...activity,
    openingHours: { ...defaults.openingHours, ...(activity.openingHours ?? {}) },
    priceDetails: {
      ...defaults.priceDetails,
      ...(storedPrice ?? {}),
      currency: storedPrice?.currency ?? activity.currency,
      adult: storedPrice?.adult ?? activity.adultPrice,
      child: storedPrice?.child ?? activity.childPrice,
      totalEstimate: storedPrice?.totalEstimate ?? activity.estimatedTotalPrice,
    },
    planType: activity.planType ?? (activity.status === 'Alternativa' ? 'Alternativa' : 'Principal'),
    reservationStatus:
      activity.reservationStatus ??
      (activity.reservationDone ? 'Reservada' : activity.reservationRequired ? 'Necesaria' : 'No necesaria'),
  };
}

export function isActivityStale(activity: Pick<Activity, 'lastVerifiedAt' | 'verificationStatus'>, days: number, now = new Date()) {
  if (activity.verificationStatus !== 'Verificado' || !activity.lastVerifiedAt) return true;
  return now.getTime() - new Date(activity.lastVerifiedAt).getTime() > days * 86_400_000;
}
