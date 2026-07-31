import Dexie, { type Table } from 'dexie';
import type {
  Accommodation,
  Activity,
  AppSettings,
  Expense,
  Flight,
  FlightAlert,
  FlightStatusHistory,
  PackingItem,
  Reminder,
  SavedPlace,
  SearchHistoryEntry,
  SearchProvider,
  Transport,
  TravelDocument,
  Trip,
} from '../domain/types';
import { completeActivity } from '../domain/activity';
import { londonTripId } from '../domain/initialData';

class TravelDatabase extends Dexie {
  trips!: Table<Trip, string>;
  activities!: Table<Activity, string>;
  accommodations!: Table<Accommodation, string>;
  transports!: Table<Transport, string>;
  documents!: Table<TravelDocument, string>;
  expenses!: Table<Expense, string>;
  packingItems!: Table<PackingItem, string>;
  reminders!: Table<Reminder, string>;
  flights!: Table<Flight, string>;
  flightStatusHistory!: Table<FlightStatusHistory, string>;
  flightAlerts!: Table<FlightAlert, string>;
  searchProviders!: Table<SearchProvider, string>;
  searchHistory!: Table<SearchHistoryEntry, string>;
  savedPlaces!: Table<SavedPlace, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('TravelCaris');
    this.version(1).stores({
      activities: 'id, day, date, order, category, status, visited, favorite',
      accommodations: 'id, startDate, endDate, active',
      transports: 'id, date, type',
      documents: 'id, type, date, important, activityId',
      expenses: 'id, date, category, activityId',
      packingItems: 'id, list, done, order',
      reminders: 'id, date, done',
      settings: 'id',
    });
    this.version(2)
      .stores({
        trips: 'id, status, startDate, endDate, destination',
        activities: 'id, tripId, day, date, order, category, status, visited, favorite',
        accommodations: 'id, tripId, startDate, endDate, active',
        transports: 'id, tripId, date, type',
        documents: 'id, tripId, type, date, important, activityId',
        expenses: 'id, tripId, date, category, activityId',
        packingItems: 'id, tripId, list, done, order',
        reminders: 'id, tripId, date, done',
        flights: 'id, tripId, scheduledDate, normalizedFlightNumber, status, lastCheckedAt',
        flightStatusHistory: 'id, flightId, detectedAt, field, important',
        flightAlerts: 'id, tripId, flightId, createdAt, type, read',
        settings: 'id',
      })
      .upgrade(async (transaction) => {
        const addTripId = (record: { tripId?: string }) => {
          record.tripId ??= londonTripId;
        };
        await Promise.all(
          ['activities', 'accommodations', 'transports', 'documents', 'expenses', 'packingItems', 'reminders'].map(
            (table) => transaction.table(table).toCollection().modify(addTripId),
          ),
        );
        await transaction
          .table('settings')
          .toCollection()
          .modify((settings: Partial<AppSettings>) => {
            settings.activeTripId ??= londonTripId;
            settings.flightProvider ??= 'manual';
            settings.flightAutoUpdate ??= false;
            settings.flightNotifications ??= false;
            settings.flightDataSaver ??= true;
            settings.flightWifiOnly ??= false;
          });
      });
    this.version(3)
      .stores({
        trips: 'id, status, startDate, endDate, destination',
        activities: 'id, tripId, day, date, order, category, status, planType, verificationStatus, visited, favorite',
        accommodations: 'id, tripId, startDate, endDate, active',
        transports: 'id, tripId, date, type',
        documents: 'id, tripId, type, date, important, activityId',
        expenses: 'id, tripId, date, category, activityId',
        packingItems: 'id, tripId, list, done, order',
        reminders: 'id, tripId, date, done',
        flights: 'id, tripId, scheduledDate, normalizedFlightNumber, status, lastCheckedAt',
        flightStatusHistory: 'id, flightId, detectedAt, field, important',
        flightAlerts: 'id, tripId, flightId, createdAt, type, read',
        searchProviders: 'id, enabled, order, kind',
        searchHistory: 'id, tripId, createdAt, providerId',
        savedPlaces: 'id, tripId, category, favorite, createdAt',
        settings: 'id',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('activities')
          .toCollection()
          .modify((activity: Activity) => Object.assign(activity, completeActivity(activity)));
        await transaction
          .table('settings')
          .toCollection()
          .modify((settings: Partial<AppSettings>) => {
            settings.placeInfoStaleDays ??= 30;
          });
      });
  }
}

export const db = new TravelDatabase();
