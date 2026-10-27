/**
 * Adapter `SourceSante` sur Health Connect (Android) via react-native-health-connect (RM-27).
 * Le module natif n'existe que dans un APK construit avec lui : chargement paresseux et protégé,
 * pour qu'un ancien APK (ou Expo Go) ne plante jamais — Health Connect y est simplement absent.
 */

import { Platform } from 'react-native';
import { MONTRE_VIDE, type DonneesMontre } from '../domain';
import type { SourceSante } from '../ports';

type HC = typeof import('react-native-health-connect');

const TYPES = [
  'SleepSession',
  'HeartRate',
  'RestingHeartRate',
  'HeartRateVariabilityRmssd',
  'Steps',
  'OxygenSaturation',
  'BloodGlucose',
  'BloodPressure',
  'Weight',
] as const;

function charger(): HC | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as HC;
  } catch {
    return null;
  }
}

export class HealthConnectSource implements SourceSante {
  private hc = charger();
  private pret = false;

  private async init(): Promise<HC | null> {
    const hc = this.hc;
    if (!hc) return null;
    try {
      if (!this.pret) {
        if ((await hc.getSdkStatus()) !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) return null;
        this.pret = await hc.initialize();
      }
      return this.pret ? hc : null;
    } catch {
      return null;
    }
  }

  async disponible(): Promise<boolean> {
    return (await this.init()) !== null;
  }

  async autoriser(): Promise<boolean> {
    const hc = await this.init();
    if (!hc) return false;
    const accordees = await hc.requestPermission(TYPES.map((recordType) => ({ accessType: 'read' as const, recordType })));
    return accordees.length > 0;
  }

  async dejaAutorise(): Promise<boolean> {
    const hc = await this.init();
    if (!hc) return false;
    try {
      return (await hc.getGrantedPermissions()).length > 0;
    } catch {
      return false;
    }
  }

  async lire(depuis: number, jusqua: number): Promise<DonneesMontre> {
    const hc = await this.init();
    const d = MONTRE_VIDE(jusqua);
    if (!hc) return d;
    const filtre = { timeRangeFilter: { operator: 'between' as const, startTime: new Date(depuis).toISOString(), endTime: new Date(jusqua).toISOString() } };
    const t = (iso: string) => Date.parse(iso);
    // Chaque type est lu séparément : un type non autorisé ou absent ne bloque pas les autres.
    const lire = async <T extends (typeof TYPES)[number]>(type: T) => {
      try {
        const tout = [];
        let pageToken: string | undefined;
        do {
          const r = await hc.readRecords(type, { ...filtre, pageSize: 1000, ...(pageToken ? { pageToken } : {}) });
          tout.push(...r.records);
          pageToken = r.pageToken || undefined;
        } while (pageToken && tout.length < 20_000);
        return tout;
      } catch {
        return [];
      }
    };
    d.sommeils = (await lire('SleepSession')).map((r) => ({ debut: t(r.startTime), fin: t(r.endTime) }));
    d.frequence = (await lire('HeartRate')).flatMap((r) => r.samples.map((s) => ({ a: t(s.time), bpm: s.beatsPerMinute })));
    d.repos = (await lire('RestingHeartRate')).map((r) => ({ a: t(r.time), bpm: r.beatsPerMinute }));
    d.hrv = (await lire('HeartRateVariabilityRmssd')).map((r) => ({ a: t(r.time), ms: r.heartRateVariabilityMillis }));
    d.pas = (await lire('Steps')).map((r) => ({ debut: t(r.startTime), fin: t(r.endTime), n: r.count }));
    d.spo2 = (await lire('OxygenSaturation')).map((r) => ({ a: t(r.time), pct: r.percentage }));
    d.glucose = (await lire('BloodGlucose')).map((r) => ({ a: t(r.time), mgdl: r.level.inMilligramsPerDeciliter }));
    d.tension = (await lire('BloodPressure')).map((r) => ({ a: t(r.time), sys: r.systolic.inMillimetersOfMercury, dia: r.diastolic.inMillimetersOfMercury }));
    d.poids = (await lire('Weight')).map((r) => ({ a: t(r.time), kg: r.weight.inKilograms }));
    return d;
  }
}
